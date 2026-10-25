/**
 * Nothing on the screen scrolls sideways (#2144). Two things can: the page,
 * and the dashboard's own column, `main.main`, whose `overflow-y: auto` makes
 * it scroll on both axes. A row of contact fields wider than the phone pushed
 * the second one and left the first at the screen's width, so a check of the
 * page alone passed while the form slid sideways under the owner's thumb.
 */
export function expectNoSidewaysScroll(): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, 'page scrollWidth').to.be.at.most(
      doc.documentElement.clientWidth,
    );
    const main = doc.querySelector('main.main');
    if (main !== null) {
      expect(main.scrollWidth, 'main scrollWidth').to.be.at.most(main.clientWidth);
    }
  });
}
