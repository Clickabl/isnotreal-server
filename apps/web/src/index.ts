import type { AlternativeDirectory, PublicEntityDirectory } from '@isnotreal/application';

export type WebRouteResult =
  | { readonly kind: 'redirect'; readonly status: 302 | 308; readonly location: string }
  | { readonly kind: 'entity'; readonly publicId: string; readonly slug: string }
  | { readonly kind: 'not-found'; readonly status: 404 }
  | { readonly kind: 'bad-gateway'; readonly status: 502 };

export function createPublicRouteResolver(deps: {
  readonly entities: PublicEntityDirectory;
  readonly alternatives: AlternativeDirectory;
}) {
  return async (pathname: string): Promise<WebRouteResult | null> => {
    const alternativeMatch = /^\/go-to-alt\/(\d+)\/?$/.exec(pathname);
    if (alternativeMatch) {
      const publicId = alternativeMatch[1];
      if (!publicId) return { kind: 'not-found', status: 404 };
      const alternative = await deps.alternatives.preferred(publicId, 'general', 'domain');
      if (!alternative?.destinationUrl) return { kind: 'not-found', status: 404 };
      if (!alternative.destinationUrl.startsWith('https://')) {
        return { kind: 'bad-gateway', status: 502 };
      }
      return { kind: 'redirect', status: 302, location: alternative.destinationUrl };
    }

    const idMatch = /^\/(\d+)\/?$/.exec(pathname);
    if (idMatch) {
      const publicId = idMatch[1];
      if (!publicId) return { kind: 'not-found', status: 404 };
      const entity = await deps.entities.byPublicId(publicId);
      return entity
        ? { kind: 'redirect', status: 308, location: `/${entity.slug}` }
        : { kind: 'not-found', status: 404 };
    }

    const slugMatch = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(pathname);
    if (slugMatch) {
      const slug = slugMatch[1];
      if (!slug) return { kind: 'not-found', status: 404 };
      const entity = await deps.entities.bySlug(slug);
      return entity
        ? { kind: 'entity', publicId: entity.publicId, slug: entity.slug }
        : { kind: 'not-found', status: 404 };
    }

    return null;
  };
}
