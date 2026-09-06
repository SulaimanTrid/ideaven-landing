/**
 * Small stroke-icon set the canvas `icon` component can render from a model
 * prop. Kept separate from the chrome icon set — these ship inside user
 * projects, so the list is deliberate and stable.
 */
export const CANVAS_ICON_PATHS: Record<string, string> = {
  home: "M4.5 10.5 12 4l7.5 6.5M6.5 9.3V19a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9.3M10 20v-5.5h4V20",
  user: "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5",
  star: "M12 4.5 14.2 9.4 19.5 10.1 15.7 13.8 16.7 19.1 12 16.5 7.3 19.1 8.3 13.8 4.5 10.1 9.8 9.4 12 4.5Z",
  heart: "M12 19.5C7 15.9 4 13 4 9.6 4 7.3 5.8 5.5 8.1 5.5c1.5 0 3 .8 3.9 2.1.9-1.3 2.4-2.1 3.9-2.1 2.3 0 4.1 1.8 4.1 4.1 0 3.4-3 6.3-8 9.9Z",
  settings: "M5 7.5h14M5 12h14M5 16.5h14",
  search: "M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.8 15.8 20 20",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7.5",
  "arrow-right": "M4.5 12h15m-6-6.5L20 12l-6.5 6.5",
  play: "M8.2 5.6v12.8a.7.7 0 0 0 1.06.6l10.3-6.4a.7.7 0 0 0 0-1.2L9.26 5a.7.7 0 0 0-1.06.6Z",
  menu: "M4 7h16M4 12h16M4 17h16",
};
