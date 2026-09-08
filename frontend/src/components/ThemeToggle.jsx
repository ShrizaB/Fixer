import { Sun, Moon } from "lucide-react";

export default function ThemeToggle({ theme, onToggle }) {
  const isLight = theme === "light";
  return (
    <button
      onClick={onToggle}
      className="theme-toggle"
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
    >
      {isLight ? <Moon size={13} /> : <Sun size={13} />}
      {isLight ? "Dark" : "Light"}
    </button>
  );
}