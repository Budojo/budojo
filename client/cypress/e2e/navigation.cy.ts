export {};

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: { id: 1, name: 'Test Academy', slug: 'test-academy', address: null } },
};
const ACADEMY_NOT_FOUND = { statusCode: 404, body: {} };
const ATHLETES_EMPTY = {
  statusCode: 200,
  body: {
    data: [],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: null, last_page: 1, path: '', per_page: 20, to: null, total: 0 },
  },
};

describe('Navigation guards', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('redirects unauthenticated visitor from / to /auth/login', () => {
    cy.visit('/');
    cy.url().should('include', '/auth/login');
  });

  it('redirects unauthenticated visitor from /dashboard to /auth/login', () => {
    cy.visit('/dashboard');
    cy.url().should('include', '/auth/login');
  });

  it('redirects unauthenticated visitor from /setup to /auth/login', () => {
    cy.visit('/setup');
    cy.url().should('include', '/auth/login');
  });

  it('lets an authenticated user with no academy reach /setup', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_NOT_FOUND).as('academy');
    cy.visitAuthenticated('/setup');
    cy.wait('@academy');
    cy.url().should('include', '/setup');
    cy.get('h1').should('contain', 'Set up your academy');
  });

  it('redirects authenticated user with academy from /setup to /dashboard', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);
    cy.visitAuthenticated('/setup');
    cy.wait('@academy');
    cy.url().should('include', '/dashboard');
  });

  it('redirects authenticated user with no academy from /dashboard to /setup', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_NOT_FOUND).as('academy');
    cy.visitAuthenticated('/dashboard');
    cy.wait('@academy');
    cy.url().should('include', '/setup');
  });

  it('lets an authenticated user with academy reach /dashboard/athletes', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.wait('@athletes');
    cy.url().should('include', '/dashboard/athletes');
  });
});

describe('Sidebar brand + sign out', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('renders the academy name as the dominant sidebar brand', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.wait('@athletes');

    cy.get('.sidebar__brand-name').should('contain.text', 'Test Academy');
    cy.get('.sidebar__brand').should('have.attr', 'aria-haspopup', 'menu');
    cy.get('.sidebar__brand').should('have.attr', 'aria-expanded', 'false');
  });

  it('opens the brand menu on click and signs the user out back to /auth/login', () => {
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY).as('athletes');
    cy.visitAuthenticated('/dashboard/athletes');
    cy.wait('@academy');
    cy.wait('@athletes');

    cy.get('.sidebar__brand').click();
    cy.get('.sidebar__brand').should('have.attr', 'aria-expanded', 'true');
    cy.contains('.p-menu .p-menuitem-link', 'Sign out').click();

    cy.url().should('include', '/auth/login');
  });
});
