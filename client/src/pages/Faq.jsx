import { useState } from 'react';

const FAQ_GROUPS = [
  {
    title: 'For food donors',
    items: [
      {
        q: `How do I donate surplus food?`,
        a: `Create a free account as a Food Provider, then choose "Post surplus food". Add what the food is, how many portions, where to pick it up, and a deadline within 24 hours. Your food then appears for nearby people and NGOs to claim.`,
      },
      {
        q: `What information should I include in a food listing?`,
        a: `Add the food's name and a short detail, how it has been kept, its type - vegetarian, non-vegetarian or vegan - the number of portions, the pickup address, and the deadline. A photo also helps people recognise the food.`,
      },
      {
        q: `Can I edit or remove a listing after publishing?`,
        a: `You can edit a listing while it is still a draft. After publishing, you can cancel it any time from "My Listings" - cancelling also cancels its claims and informs the claimers. A listing that passes its deadline ends on its own.`,
      },
      {
        q: `How do NGOs discover and claim available food?`,
        a: `NGOs and claimers use the Browse page. It shows the food, how many portions are left, and how much time is left. They claim only the portions they can collect, and the donor gets a notification right away.`,
      },
      {
        q: `What happens after an NGO claims my listing?`,
        a: `You get a notification, and the claimer gets a secret pickup code. When they come to collect, ask them for that code and confirm it in the app. The portions are then marked as collected.`,
      },
    ],
  },
  {
    title: 'For NGOs',
    items: [
      {
        q: `How do I register as an NGO?`,
        a: `On the Register page, choose "NGO / organisation" and add your organisation name and registration detail. You can add your verification documents while registering, or later from the NGO Panel. Your account works straight away - you do not have to wait for verification before claiming food.`,
      },
      {
        q: `Why do I need to upload verification documents?`,
        a: `So an admin can check that your organisation is real. Verified NGOs get a "Verified NGO" label, which helps donors trust who is collecting their food.`,
      },
      {
        q: `Which document types are accepted, and what is the file size limit?`,
        a: `PDF, JPEG and PNG files, up to 20 MB per file. You can choose several files at once. A registration certificate is a good document to upload.`,
      },
      {
        q: `How long does NGO verification take?`,
        a: `There is no fixed time - an admin checks the documents by hand. You will get a notification with the result, and the result is also shown in your NGO Panel. You can claim food while you wait.`,
      },
      {
        q: `What does it mean if my NGO remains unverified?`,
        a: `You can still claim food - your claims simply do not show the "Verified NGO" label yet. If an admin kept your NGO unverified after checking, the reason is shown in your NGO Panel, so you know what to fix.`,
      },
      {
        q: `How can I update my verification documents?`,
        a: `In the NGO Panel, the verification documents section shows everything you have uploaded. You can remove a document or upload new ones any time - uploading a new document asks for a fresh check.`,
      },
    ],
  },
  {
    title: 'Recipients & food safety',
    items: [
      {
        q: `Who can claim a food donation?`,
        a: `Anyone with a Claimer account, and registered NGOs. Anyone can look at the food, but you must sign in to claim it. You claim by portions, so you can take only some of a listing, not all of it.`,
      },
      {
        q: `How do I know whether a listing is still available?`,
        a: `The Browse page shows how many portions are left and how much time is left for each listing. Fully claimed listings are marked "Fully claimed", and listings past their deadline are removed.`,
      },
      {
        q: `What should I check before accepting donated food?`,
        a: `Check the deadline, how the food has been kept (this is written in the listing), and that the packet is properly closed when you collect it. Every donor must tick a food-safety checklist before posting - clean preparation, correct cooking time, no signs of spoilage, and covered packaging. If the food looks or smells bad when you collect it, do not accept it.`,
      },
      {
        q: `What should I do if food appears unsafe or a listing is inaccurate?`,
        a: `Do not accept or eat food that looks spoiled. If you have claimed it, you can cancel the claim from "My Claims" - cancelling at least 30 minutes before the deadline gives the portions back to the listing. Admins also watch listings and can remove ones that break the rules.`,
      },
    ],
  },
  {
    title: 'Accounts & privacy',
    items: [
      {
        q: `How do I update my profile information?`,
        a: `Open Profile from the menu. You can change your name and your mobile number, then save. The change appears everywhere your name or number is shown in the app.`,
      },
      {
        q: `Who can see my contact details and donation information?`,
        a: `Your phone number is never public. A listing shows the donor's number only when the donor switches on "show contact" for that listing - and even then, only signed-in users and claimers with a confirmed claim can see it. People who are not signed in never see phone numbers. NGO verification documents are also private - only the NGO and the admins checking them can see them.`,
      },
    ],
  },
];

export default function Faq() {
  const [openKey, setOpenKey] = useState('');

  return (
    <main>
      <section className="card">
        <h1>Frequently asked questions</h1>
        {FAQ_GROUPS.map((group, gi) => (
          <div key={group.title} className="faq-group">
            <h2>{group.title}</h2>
            {group.items.map((item, ii) => {
              const key = `${gi}-${ii}`;
              const open = openKey === key;
              return (
                <div key={key} className="faq-item">
                  <button
                    type="button"
                    className="faq-q"
                    aria-expanded={open}
                    onClick={() => setOpenKey(open ? '' : key)}
                  >
                    <span>{item.q}</span>
                    <span className="faq-arrow">{open ? '−' : '+'}</span>
                  </button>
                  {open && <p className="faq-a">{item.a}</p>}
                </div>
              );
            })}
          </div>
        ))}
      </section>
    </main>
  );
}
