/**
 * Every page outside the dashboard shell starts below the status bar (#2034).
 *
 * The phone draws the app edge to edge under a transparent status bar, and
 * the desktop draws its own title bar over the top 40 px. Each of these
 * pages kept a fixed top padding of its own, smaller than either, so their
 * header ran under the clock (the owner's screenshot of the welcome page,
 * 2 Oct 2026). Cypress has no safe-area inset, so the test gives the window
 * a 40 px one, as the desktop's title bar is, and checks that no text
 * starts inside it.
 */
const INSET = 40;

const PAGES = [
  '/',
  '/privacy',
  '/terms',
  '/sub-processors',
  '/cookie-policy',
  '/help',
  '/offline',
  '/error',
  '/unsubscribed',
  '/account-deletion',
  '/account-deletion/it',
  '/account/deletion-cancel',
  '/no-such-page',
];

/** Elements that draw text of their own, visible on screen. */
function textBoxes(doc: Document): DOMRect[] {
  return [...doc.body.querySelectorAll<HTMLElement>('*')]
    .filter((el) =>
      [...el.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
      ),
    )
    .filter((el) => el.closest('[data-cy="cookie-banner"], p-toast') === null)
    .map((el) => el.getBoundingClientRect())
    .filter((box) => box.height > 0 && box.width > 0 && box.bottom > 0);
}

describe('pages outside the dashboard, below the status bar (#2034)', () => {
  PAGES.forEach((page) => {
    it(`${page} starts its text below a ${INSET} px status bar`, () => {
      cy.viewport(375, 800);
      cy.visit(page, {
        onBeforeLoad(win) {
          win.document.documentElement.style.setProperty('--budojo-safe-top', `${INSET}px`);
          win.localStorage.setItem('budojoLang', 'en');
        },
      });
      // Retried until the lazy route and its translations have drawn text:
      // a page that stays inside the inset fails at the timeout.
      cy.document().should((doc) => {
        const boxes = textBoxes(doc);
        expect(boxes.length, 'the page drew some text').to.be.greaterThan(0);
        const top = Math.min(...boxes.map((box) => box.top));
        expect(top, 'the highest text').to.be.at.least(INSET);
      });
    });
  });
});

describe('a help deep link, below the status bar (#2034)', () => {
  it('lands the targeted entry below the inset, not behind it', () => {
    cy.viewport(375, 800);
    cy.visit('/help#unpaid-badge', {
      onBeforeLoad(win) {
        win.document.documentElement.style.setProperty('--budojo-safe-top', `${INSET}px`);
        win.localStorage.setItem('budojoLang', 'en');
      },
    });
    // Retried until the anchor scroll has run: the entry starts far below
    // the fold, so it reads as scrolled only once it is near the top.
    cy.get('[data-cy="help-entry-unpaid-badge"]').should(($entry) => {
      const top = $entry[0].getBoundingClientRect().top;
      expect(top, 'the entry was scrolled to').to.be.lessThan(200);
      expect(top, 'the entry starts below the inset').to.be.at.least(INSET);
    });
  });
});
