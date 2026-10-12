/** A modal backdrop that closes when the click lands on it, not on the dialog. */
export default function Backdrop({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {children}
    </div>
  );
}
