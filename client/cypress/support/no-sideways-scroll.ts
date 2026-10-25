/**
 * Nothing on the screen scrolls sideways (#2144). Two things can: the page,
 * and the dashboard's own column, `main.main`, whose `overflow-y: auto` makes
 * it scroll on both axes. A row of contact fields wider than the phone pushed
 * the second one and left the first at the screen's width, so a check of the
 * page alone passed while the form slid sideways under the owner's thumb.
 *
 * Inside the dashboard the column must be there: a spec whose shell changed
 * would otherwise check the page alone again, in silence. A page outside it
 * (the landing, the legal pages, sign-in) says so with `'public'`.
 */
export function expectNoSidewaysScroll(where: 'dashboard' | 'public' = 'dashboard'): void {
  // `should`, retried: the shell renders after the visit, and a check made
  // before it is there measures nothing.
  cy.document().should((doc) => {
    expect(doc.documentElement.scrollWidth, 'page scrollWidth').to.be.at.most(
      doc.documentElement.clientWidth,
    );
    const main = doc.querySelector('main.main');
    if (where === 'public') {
      expect(main, 'a public page has no dashboard column').to.equal(null);
      return;
    }
    expect(main, "the dashboard's column, main.main").to.not.equal(null);
    expect(main!.scrollWidth, 'main scrollWidth').to.be.at.most(main!.clientWidth);
  });
}
