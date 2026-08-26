export type Redirect = { path: string; append: boolean };

export function extractRedirect(tokens: string[]): { tokens: string[]; redirect?: Redirect } {
  const index = tokens.findIndex((token) => token === ">" || token === ">>");
  if (index === -1 || index === tokens.length - 1) {
    return { tokens };
  }

  return {
    tokens: tokens.slice(0, index),
    redirect: { path: tokens[index + 1], append: tokens[index] === ">>" },
  };
}
