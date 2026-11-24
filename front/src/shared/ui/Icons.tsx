import React from "react";

export const ShareIcon = ({ size = 22, color = "#555" }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

export const EyeIcon = ({ size = 18, color = "#555" }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = ({ size = 18, color = "#555" }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17.94 17.94A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a19.4 19.4 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.9 9.9 0 0 1 12 4c6.4 0 10 7 10 7a19.5 19.5 0 0 1-2.16 3.19" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

export const OsmIcon = ({ size = 22, color = "#555" }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M15 11.5c0 1.93-1.57 3.5-3.5 3.5S8 13.43 8 11.5 9.57 8 11.5 8s3.5 1.57 3.5 3.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L8.5 14.5c.32.32.75.5 1.21.5H11v1.5c0 .55.45 1 1 1h1v2.93zM18 17c-.7-.7-1.37-1.04-2-1.5V14c0-1.1-.9-2-2-2h-1V9.5c0-.83-.67-1.5-1.5-1.5H8.5L7.5 7h4c.55 0 1-.45 1-1s-.45-1-1-1H7.3c.7-1.2 1.9-2 3.3-2 2.1 0 3.9 1.3 4.7 3.2.1 0 .2-.1.3-.1.8 0 1.5.7 1.5 1.5 0 .3-.1.6-.3.8L15 11l2 2 2.9-2.9c.1.3.1.6.1.9 0 3.3-2.1 6.1-5 7.1v-2.1z" />
  </svg>
);
