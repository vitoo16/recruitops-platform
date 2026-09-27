export interface RequestPathInput {
  originalUrl: string;
}

export function getSafeRequestPath(request: RequestPathInput): string {
  const queryIndex = request.originalUrl.indexOf('?');
  const path = queryIndex === -1 ? request.originalUrl : request.originalUrl.slice(0, queryIndex);
  return path || '/';
}
