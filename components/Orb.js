// A player's avatar: a small lit orb tinted by their name, with their initial.
export default function Orb({ name, hue }) {
  return (
    <span className="orb" style={{ '--h': hue }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
