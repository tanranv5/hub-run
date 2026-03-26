export function readCookie(setCookie: string | null): string {
  if (!setCookie) {
    throw new Error("Missing Set-Cookie header");
  }

  const [cookie] = setCookie.split(";");
  return cookie;
}
