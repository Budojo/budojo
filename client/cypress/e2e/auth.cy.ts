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
    cy.get('button[type="submit"]').click();

    cy.wait('@register');
    cy.wait('@academy');
    cy.url().should('include', '/dashboard/athletes');
  });

  it('has a link to the login page', () => {
    cy.get('a').contains('Sign in').click();
    cy.url().should('include', '/auth/login');
  });
});
