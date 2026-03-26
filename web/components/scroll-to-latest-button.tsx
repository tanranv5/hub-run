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
      className="absolute bottom-5 right-5 z-10 inline-flex items-center rounded-full border border-cyan-400/25 bg-slate-950/90 px-4 py-2 text-xs font-medium text-cyan-700 dark:text-cyan-100 shadow-lg shadow-slate-950/35 backdrop-blur transition hover:bg-panel"
    >
      查看最新消息
    </button>
  );
}
