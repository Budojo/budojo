import { MOCK_ACADEMY } from '../support/fixtures';

const ACADEMY_OK = {
  statusCode: 200,
  body: { data: MOCK_ACADEMY },
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
const LOGIN_OK = {
  statusCode: 200,
  body: {
    data: { id: 1, name: 'Test User', email: 'test@example.com' },
    token: 'fake-token',
  },
};

// ---------------------------------------------------------------------------
// Login page
// ---------------------------------------------------------------------------

describe('Login page', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    // Post-login lands on /dashboard/athletes, where the M3.4 expiring-documents
    // widget fetches /api/v1/documents/expiring on mount. Stub it here so the
    // request never reaches the Vite dev-server proxy (no `api` host in CI) —
    // otherwise the CI log fills with `getaddrinfo EAI_AGAIN api` noise that
    // can mask real failures.
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.visit('/auth/login');
  });

  it('renders the login form', () => {
    cy.get('h1').should('contain', 'Welcome back');
    cy.get('input[id="email"]').should('exist');
    cy.get('input[id="password"]').should('exist');
    cy.get('button[type="submit"]').should('contain.text', 'Sign in');
  });

  it('shows validation errors when submitting empty form', () => {
    cy.get('button[type="submit"]').click();
    cy.contains('Email is required').should('be.visible');
    cy.contains('Password is required').should('be.visible');
  });

  it('shows validation error for invalid email format', () => {
    cy.get('input[id="email"]').type('not-an-email');
    cy.get('input[id="email"]').blur();
    cy.contains('Enter a valid email address').should('be.visible');
  });

  it('successful login with academy redirects to /dashboard/athletes', () => {
    cy.intercept('POST', '/api/v1/auth/login', LOGIN_OK).as('login');
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);

    cy.get('input[id="email"]').type('test@example.com');
    cy.get('input[id="password"]').type('password123');
    cy.get('button[type="submit"]').click();

    cy.wait('@login');
    cy.wait('@academy');
    cy.url().should('include', '/dashboard/athletes');
  });

  it('successful login without academy redirects to /setup', () => {
    cy.intercept('POST', '/api/v1/auth/login', LOGIN_OK).as('login');
    cy.intercept('GET', '/api/v1/academy', ACADEMY_NOT_FOUND).as('academy');

    cy.get('input[id="email"]').type('test@example.com');
    cy.get('input[id="password"]').type('password123');
    cy.get('button[type="submit"]').click();

    cy.wait('@login');
    cy.wait('@academy');
    cy.url().should('include', '/setup');
  });

  it('shows error message on invalid credentials', () => {
    cy.intercept('POST', '/api/v1/auth/login', {
      statusCode: 422,
      body: { message: 'The provided credentials are incorrect.' },
    }).as('loginFail');

    cy.get('input[id="email"]').type('test@example.com');
    cy.get('input[id="password"]').type('wrongpassword');
    cy.get('button[type="submit"]').click();

    cy.wait('@loginFail');
    cy.get('.p-message').should('be.visible');
    cy.get('.p-message').should('contain.text', 'incorrect');
  });

  it('has a link to the register page', () => {
    cy.get('a').contains('Create one').click();
    cy.url().should('include', '/auth/register');
  });
});

// ---------------------------------------------------------------------------
// Register page
// ---------------------------------------------------------------------------

describe('Register page', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    // Post-register success → /dashboard/athletes → expiring widget fires.
    // Same defensive stub as the Login page describe above.
    cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: { data: [] } });
    cy.visit('/auth/register');
  });

  it('renders the register form', () => {
    cy.get('h1').should('contain', 'Create your account');
    cy.get('input[id="name"]').should('exist');
    cy.get('input[id="email"]').should('exist');
    cy.get('input[id="password"]').should('exist');
    cy.get('input[id="password_confirmation"]').should('exist');
    cy.get('button[type="submit"]').should('contain.text', 'Create account');
  });

  it('shows validation errors when submitting empty form', () => {
    cy.get('button[type="submit"]').click();
    cy.contains('Name is required').should('be.visible');
    cy.contains('Email is required').should('be.visible');
    cy.contains('Password is required').should('be.visible');
  });

  it('shows error when passwords do not match', () => {
    cy.get('input[id="name"]').type('Test User');
    cy.get('input[id="email"]').type('test@example.com');
    cy.get('input[id="password"]').type('password123');
    cy.get('input[id="password_confirmation"]').type('different-password');
    cy.get('button[type="submit"]').click();
    cy.contains('Passwords do not match').should('be.visible');
  });

  it('successful registration with academy redirects to /dashboard/athletes', () => {
    cy.intercept('POST', '/api/v1/auth/register', LOGIN_OK).as('register');
    cy.intercept('GET', '/api/v1/academy', ACADEMY_OK).as('academy');
    cy.intercept('GET', '/api/v1/athletes*', ATHLETES_EMPTY);

    cy.get('input[id="name"]').type('Test User');
    cy.get('input[id="email"]').type('test@example.com');
    cy.get('input[id="password"]').type('password123');
    cy.get('input[id="password_confirmation"]').type('password123');
    // Privacy gate (#219) — submit blocks until this is ticked.
    cy.get('[data-cy="privacy-consent-checkbox"]').click();
    // Terms-of-Service gate (#420) — second blocking checkbox.
    cy.get('[data-cy="terms-consent-checkbox"]').click();
    cy.get('button[type="submit"]').click();

    cy.wait('@register').its('request.body').should('include', { terms_accepted: true });
    cy.wait('@academy');
    cy.url().should('include', '/dashboard/athletes');
  });

  it('blocks submit + shows the privacy error when consent is missing (#219)', () => {
    cy.intercept('POST', '/api/v1/auth/register', cy.spy().as('register'));

    cy.get('input[id="name"]').type('Test User');
    cy.get('input[id="email"]').type('test@example.com');
    cy.get('input[id="password"]').type('password123');
    cy.get('input[id="password_confirmation"]').type('password123');
    // Tick ToS but NOT privacy — pins the privacy error path.
    cy.get('[data-cy="terms-consent-checkbox"]').click();
    cy.get('button[type="submit"]').click();

    cy.get('[data-cy="privacy-consent-error"]').should('be.visible');
    // The API was never called — Validators.requiredTrue blocked it.
    cy.get('@register').should('not.have.been.called');
  });

  it('blocks submit + shows the terms error when consent is missing (#420)', () => {
    cy.intercept('POST', '/api/v1/auth/register', cy.spy().as('register'));

    cy.get('input[id="name"]').type('Test User');
    cy.get('input[id="email"]').type('test@example.com');
    cy.get('input[id="password"]').type('password123');
    cy.get('input[id="password_confirmation"]').type('password123');
    // Tick privacy but NOT ToS — pins the ToS error path.
    cy.get('[data-cy="privacy-consent-checkbox"]').click();
    cy.get('button[type="submit"]').click();

    cy.get('[data-cy="terms-consent-error"]').should('be.visible');
    cy.get('@register').should('not.have.been.called');
  });

  it('the consent link points to /privacy and opens in a new tab (#219)', () => {
    cy.get('[data-cy="privacy-consent-link"]')
      .should('have.attr', 'target', '_blank')
      .and('have.attr', 'rel')
      .and('contain', 'noopener');
    cy.get('[data-cy="privacy-consent-link"]').should('have.attr', 'href', '/privacy');
  });

  it('the terms-of-service link points to /terms and opens in a new tab (#420)', () => {
    cy.get('[data-cy="terms-consent-link"]')
      .should('have.attr', 'target', '_blank')
      .and('have.attr', 'rel')
      .and('contain', 'noopener');
    cy.get('[data-cy="terms-consent-link"]').should('have.attr', 'href', '/terms');
  });

  it('has a link to the login page', () => {
    cy.get('a').contains('Sign in').click();
    cy.url().should('include', '/auth/login');
  });
});
