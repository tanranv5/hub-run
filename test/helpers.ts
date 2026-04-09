export function readCookie(setCookie: string | null): string {
  if (!setCookie) {
    throw new Error("Missing Set-Cookie header");
  }

  const [cookie] = setCookie.split(";");
  return cookie;
}

export function restoreEnvVar(
  name: string,
  previousValue: string | undefined,
): void {
  if (previousValue === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previousValue;
}
