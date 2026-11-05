/**
 * The belt spine stands clear of the face (#2191). The spine is drawn against
 * the row, not the identity: `left: 0.375rem` from the row's edge, while the
 * avatar starts after the row's own padding. A row with less padding than the
 * spine needs glues the stripe to the circle, and the belt reads as part of
 * the face. Soldi shipped that way, with every unit test green, because only
 * a browser lays the two out.
 */
export const SPINE_CLEARANCE_PX = 8;

export function expectSpineClear(): void {
  // `should`, retried: the rows render after their request answers.
  cy.get('app-athlete-identity').should(($hosts) => {
    let measured = 0;
    $hosts.each((_, host) => {
      const spine = host.querySelector('.athlete-identity__spine');
      const avatar = host.querySelector('.athlete-identity__avatar');
      if (spine === null || avatar === null) {
        return;
      }
      const s = spine.getBoundingClientRect();
      const a = avatar.getBoundingClientRect();
      if (s.width === 0 || a.width === 0) {
        return;
      }
      measured++;
      expect(a.left - s.right, `spine to avatar, «${host.textContent?.trim()}»`).to.be.at.least(
        SPINE_CLEARANCE_PX,
      );
    });
    expect(measured, 'identities measured').to.be.greaterThan(0);
  });
}
