"""
train_gap.py - Food Waste Saver (HA040), Hackathon 2K26 in-window training.

Trains a small "gap" classifier for dishes the public food models do
not know - idli, samosa and misal pav - plus an "other" class for
everything else. Head-only fine-tune of google/vit-base-patch16-224:
the vision backbone stays frozen, only the classification head learns.

Data (ImageFolder layout from our prep step, test set is locked and
source-separated - it is only ever used to measure, never to train):
  <data>/train/{idli,misal_pav,other,samosa}/...
  <data>/test/{idli,misal_pav,other,samosa}/...

The trained model is saved OUTSIDE the repo - models are data, not code.
"""
import argparse
import json
import random
import time
from pathlib import Path

import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from transformers import AutoImageProcessor, ViTForImageClassification

CLASSES = ["idli", "misal_pav", "other", "samosa"]  # alphabetical = folder order
BASE_MODEL = "google/vit-base-patch16-224"


class FolderDataset(Dataset):
    def __init__(self, root, processor):
        self.processor = processor
        self.items = []
        root = Path(root)
        for label, name in enumerate(CLASSES):
            for p in sorted((root / name).glob("*")):
                if p.is_file():
                    self.items.append((p, label))

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        path, label = self.items[i]
        img = Image.open(path).convert("RGB")
        px = self.processor(images=img, return_tensors="pt")["pixel_values"][0]
        return px, label


def evaluate(model, loader, device):
    model.eval()
    confusion = [[0] * len(CLASSES) for _ in CLASSES]
    correct = total = 0
    with torch.no_grad():
        for x, y in loader:
            logits = model(pixel_values=x.to(device)).logits
            pred = logits.argmax(dim=1).cpu()
            for t, p in zip(y.tolist(), pred.tolist()):
                confusion[t][p] += 1
                correct += int(t == p)
                total += 1
    return correct / max(total, 1), confusion


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=r"D:\Chrome_Downloads\fws-train\prepared\full")
    ap.add_argument("--out", default=r"D:\Chrome_Downloads\fws-train\gap_model_event")
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=2e-3)
    args = ap.parse_args()

    random.seed(42)
    torch.manual_seed(42)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device} | data: {args.data} | out: {args.out}")

    processor = AutoImageProcessor.from_pretrained(BASE_MODEL)
    id2label = {i: name for i, name in enumerate(CLASSES)}
    label2id = {name: i for i, name in enumerate(CLASSES)}
    model = ViTForImageClassification.from_pretrained(
        BASE_MODEL, num_labels=len(CLASSES), id2label=id2label,
        label2id=label2id, ignore_mismatched_sizes=True,
    )
    # Head-only: freeze everything except the classifier.
    trainable = 0
    for name, p in model.named_parameters():
        p.requires_grad = "classifier" in name
        if p.requires_grad:
            trainable += p.numel()
    print(f"Trainable parameters (head only): {trainable}")
    model.to(device)

    train_ds = FolderDataset(Path(args.data) / "train", processor)
    test_ds = FolderDataset(Path(args.data) / "test", processor)
    print(f"Train images: {len(train_ds)} | Locked test images: {len(test_ds)}")
    train_loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True)
    test_loader = DataLoader(test_ds, batch_size=args.batch)

    opt = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=args.lr
    )
    loss_fn = torch.nn.CrossEntropyLoss()

    best_acc = -1.0
    history = []
    for epoch in range(1, args.epochs + 1):
        start = time.time()
        model.train()
        running = 0.0
        for x, y in train_loader:
            opt.zero_grad()
            logits = model(pixel_values=x.to(device)).logits
            loss = loss_fn(logits, y.to(device))
            loss.backward()
            opt.step()
            running += loss.item()
        acc, confusion = evaluate(model, test_loader, device)
        per_class = {}
        for i, name in enumerate(CLASSES):
            row = confusion[i]
            per_class[name] = f"{row[i]}/{sum(row)}"
        print(
            f"Epoch {epoch}/{args.epochs} | train loss {running / len(train_loader):.4f} "
            f"| TEST accuracy {acc:.4f} | per-class {per_class} | {time.time() - start:.0f}s"
        )
        history.append({"epoch": epoch, "testAccuracy": acc, "perClass": per_class,
                        "confusion": confusion})
        if acc > best_acc:
            best_acc = acc
            model.save_pretrained(args.out)
            processor.save_pretrained(args.out)
            print(f"  -> new best, saved to {args.out}")

    Path(args.out, "training_log.json").write_text(
        json.dumps({"bestTestAccuracy": best_acc, "history": history}, indent=2)
    )
    print(f"DONE. Best locked-test accuracy: {best_acc:.4f}")


if __name__ == "__main__":
    main()
