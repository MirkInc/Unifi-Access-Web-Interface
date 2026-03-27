export function getRequestOrigin(req: Request): string {
  const host = req.headers.get('host') ?? 'localhost:3000'
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const proto =
    forwardedProto ??
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
  return `${proto}://${host}`
}

export function getRequestRpId(req: Request): string {
  const host = req.headers.get('host') ?? 'localhost:3000'
  return host.split(':')[0]
}

