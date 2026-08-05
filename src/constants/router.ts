import type { RouterItem } from '@lib/config/types';

export { RESERVED_ROUTES } from '@lib/config/reserved-routes';

export type Router = RouterItem;

/** Shared paths consumed by routeBuilder and navigation components. */
export enum Routes {
  Home = '/',
  About = '/about',
  Categories = '/categories',
  Tags = '/tags',
  Friends = '/friends',
  Post = '/post',
  Archives = '/archives',
}

/** Fallback navigation used when `config/site.yaml` does not define `navigation`. */
export const DEFAULT_ROUTERS: Router[] = [
  { name: 'Home', path: Routes.Home, icon: 'fa6-solid:house-chimney' },
  { name: 'About', path: Routes.About, icon: 'fa6-regular:circle-user' },
];
