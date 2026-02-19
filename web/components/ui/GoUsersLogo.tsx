interface Props {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

const SIZES = { sm: 28, md: 36, lg: 48 };
const FONT_SIZES = { sm: "text-sm", md: "text-base", lg: "text-xl" };

export default function GoUsersLogo({ size = "md", showText = true }: Props) {
  const px = SIZES[size];
  return (
    <div className="flex items-center gap-2">
      <svg
        width={px}
        height={px}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="gu-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        {/* Hexagon */}
        <path
          d="M24 2L43.053 13V35L24 46L4.947 35V13L24 2Z"
          fill="url(#gu-grad)"
        />
        {/* User silhouette — head */}
        <circle cx="24" cy="18" r="6" fill="white" fillOpacity="0.95" />
        {/* User silhouette — body */}
        <path
          d="M12 38c0-6.627 5.373-12 12-12s12 5.373 12 12"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.95"
        />
      </svg>
      {showText && (
        <span
          className={`font-bold tracking-tight ${FONT_SIZES[size]}`}
          style={{
            background: "linear-gradient(to right, #0ea5e9, #6366f1)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          GoUsers
        </span>
      )}
    </div>
  );
}
