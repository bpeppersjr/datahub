// Serialized by Playwright and executed only against selected visible cards.
// Keep this function self-contained; never inspect backing provider objects.
export function projectNhVisibleCards(elements) {
  if (elements.length > 20) return [{ rejection: 'card-limit' }];
  return elements.map(card => {
    const prefix = 'https://new-hampshire.my.site.com/nhccis/NH_childcaresearchaccountdetail?id=';
    // The renderer uses the same detail class for its separate contact column.
    // Identify the business parent by its direct initial-paragraph detail link,
    // not by position or the total count of class matches.
    const details = [...card.querySelectorAll('.slds-tile__detail')].filter(parent =>
      [...parent.querySelectorAll(':scope > p:first-child > a')].some(anchor => (anchor.getAttribute('href') ?? '').startsWith(prefix)));
    if (details.length !== 1) return { rejection: 'ambiguous-detail-parent' };
    const anchors = details[0].querySelectorAll(':scope > p:first-child > a');
    const address = details[0].querySelector(':scope > div');
    if (anchors.length !== 1) return { rejection: 'ambiguous-name-link' };
    if (!address || !anchors[0].getClientRects().length || !address.getClientRects().length
      || getComputedStyle(anchors[0]).visibility !== 'visible' || getComputedStyle(address).visibility !== 'visible') return { rejection: 'missing-or-hidden-field' };
    if ([...address.children].some(child => child.tagName !== 'BR')) return { rejection: 'unsupported-address-markup' };
    return { row: { name: [...anchors[0].childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim(),
      detail_url: anchors[0].getAttribute('href'), address_lines: address.innerText.split(/\r?\n/).map(line => line.trim()).filter(Boolean) } };
  });
}
