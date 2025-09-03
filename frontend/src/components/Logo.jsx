import React from "react";

const Logo = ({ size = "md", className = "", withFallback = true }) => {
  const sizeClasses = {
    xs: "w-16 h-16",
    sm: "w-18 h-18",
    md: "w-20 h-20",
    lg: "w-26 h-26",
    xl: "w-30 h-30",
    custom: "",
  };

  const fallbackSvg =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='40' fill='%2340916c' /%3E%3Ctext x='50' y='65' font-family='Arial' font-size='30' text-anchor='middle' fill='white'%3EGP%3C/text%3E%3C/svg%3E";

  return (
    <img
      src="/assets/gp-logo.png"
      alt="GP Logo"
      className={`object-contain ${size === "custom" ? "" : sizeClasses[size]} ${className}`}
      onError={(e) => {
        if (withFallback) {
          e.currentTarget.onerror = null;
          e.currentTarget.src = fallbackSvg;
        } else {
          e.currentTarget.onerror = null;
          e.currentTarget.style.display = "none";
        }
      }}
    />
  );
};

export default Logo;
