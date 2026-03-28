export async function refreshAppData(props: {
  bumpRefreshVersion: () => void;
  reloadConversation?: () => Promise<void>;
  reloadProviders?: () => Promise<void>;
}) {
  const { bumpRefreshVersion, reloadConversation, reloadProviders } = props;
  try {
    await reloadConversation?.();
    await reloadProviders?.();
  } finally {
    bumpRefreshVersion();
  }
}
