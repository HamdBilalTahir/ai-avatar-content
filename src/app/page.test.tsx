import { redirect } from 'next/navigation';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

import Home from './page';

describe('Home', () => {
  it('redirects to /avatar/new', () => {
    Home();
    expect(redirect).toHaveBeenCalledWith('/avatar/new');
  });
});
