interface ScrollToLatestButtonProps {
  onClick: () => void;
}

export default function ScrollToLatestButton(
  props: ScrollToLatestButtonProps,
) {
  const { onClick } = props;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="查看最新消息"
      className="absolute bottom-5 right-5 z-10 inline-flex items-center rounded-full border border-accent/25 bg-panel px-4 py-2 text-xs font-medium text-accent shadow-lg shadow-black/20 backdrop-blur transition hover:bg-surface-hover"
    >
      查看最新消息
    </button>
  );
}
