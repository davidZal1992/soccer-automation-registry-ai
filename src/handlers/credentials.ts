export function handleCredsUpdate(saveCreds: () => Promise<void>) {
  return async () => {
    await saveCreds();
  };
}
