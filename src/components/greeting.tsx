/** "Olá, Ana!" com o primeiro nome de quem está logado. */
export function Greeting({ fullName }: { fullName: string }) {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  const name = first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1).toLocaleLowerCase("pt-BR");
  return <p className="text-lg font-medium text-heading">Olá, {name}!</p>;
}
