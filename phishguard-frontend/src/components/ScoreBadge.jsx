export default function ScoreBadge({ level, score }) {
  return (
    <span className={`badge badge-${level}`}>
      {level} {typeof score === "number" ? `· ${score}` : ""}
    </span>
  );
}
