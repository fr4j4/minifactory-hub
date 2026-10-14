import type { Shape } from '../translate';
import type { es } from '../es';

export const auth: Shape<typeof es['auth']> = {
  invalidCredentials: 'Incorrect email or password.',
  throttled: 'Too many attempts. Wait a few minutes and try again.',
  email: 'Email',
  password: 'Password',
  submit: 'Sign in',
  submitting: 'Signing in…',
  eyebrow: 'Workshop access',
  greeting: 'Welcome back',
  intro: 'Sign in with your workshop email.',
  heroLine1: 'From file to delivery,',
  heroLine2: 'layer by layer.',
  heroText: 'Orders, quotes, server-side slicing, inventory and your workshop\'s production queue, all in one place.',
  noPermission: 'No permission: {mod} ({action})',
};
