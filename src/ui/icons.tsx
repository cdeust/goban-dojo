import type { ReactNode } from 'react';

const Svg = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    aria-hidden="true"
    focusable="false"
    fill="currentColor"
  >
    {children}
  </svg>
);

export const IconPlay = () => (
  <Svg>
    <path d="M7 4.5v15l13-7.5z" />
  </Svg>
);
export const IconPause = () => (
  <Svg>
    <path d="M6 4.5h4.2v15H6zM13.8 4.5H18v15h-4.2z" />
  </Svg>
);
export const IconStepBack = () => (
  <Svg>
    <path d="M16.5 5v14L6 12z" />
  </Svg>
);
export const IconStepForward = () => (
  <Svg>
    <path d="M7.5 5v14L18 12z" />
  </Svg>
);
export const IconFirst = () => (
  <Svg>
    <path d="M5 5h2.4v14H5zM19.5 5v14L9 12z" />
  </Svg>
);
export const IconLast = () => (
  <Svg>
    <path d="M16.6 5H19v14h-2.4zM4.5 5v14L15 12z" />
  </Svg>
);
export const IconPrevGame = () => (
  <Svg>
    <path d="M12.5 5v14L4 12zM21 5v14l-8.5-7z" />
  </Svg>
);
export const IconNextGame = () => (
  <Svg>
    <path d="M11.5 5v14l8.5-7zM3 5v14l8.5-7z" />
  </Svg>
);
export const IconClose = () => (
  <Svg>
    <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z" />
  </Svg>
);
