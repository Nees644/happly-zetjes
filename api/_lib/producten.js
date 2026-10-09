// api/_lib/producten.js
// Wat je via Mollie kunt kopen. De checkout kiest op naam, de webhook leest
// dezelfde naam terug uit de Mollie-metadata en maakt de juiste invite.
// Prijs en looptijd staan alleen hier.

const PRODUCTEN = {
  personal: {
    prijs: '79.00',
    omschrijving: 'Zetjes | personal jaarabonnement',
    context: 'ondernemen',
    label: 'Zetjes | personal',
    maxUses: 3,
    dagen: 365,
    looptijdTekst: '12 maanden',
  },
  rookvrij: {
    prijs: '19.95',
    omschrijving: 'Zetjes, 3 maanden', // neutraal: staat op het bankafschrift
    context: 'rookvrij',
    label: 'Zetjes Rookvrij',
    maxUses: 2,
    dagen: 92,
    looptijdTekst: '3 maanden',
  },
};

function getProduct(naam) {
  return PRODUCTEN[naam] ? { naam, ...PRODUCTEN[naam] } : null;
}

module.exports = { PRODUCTEN, getProduct };
