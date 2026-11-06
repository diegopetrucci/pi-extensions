// Generated copy of shared/glimpse/glimpseui.d.ts.
// Edit the canonical source, then run `npm run sync:shared`.
// Do not edit this package-local copy directly.
declare module "glimpseui" {
  export type FollowMode = "snap" | "spring";
  export type CursorAnchor =
    | "top-left"
    | "top-right"
    | "right"
    | "bottom-right"
    | "bottom-left"
    | "left";

  export interface GlimpseOpenOptions {
    width?: number;
    height?: number;
    title?: string;
    x?: number;
    y?: number;
    frameless?: boolean;
    floating?: boolean;
    transparent?: boolean;
    clickThrough?: boolean;
    followCursor?: boolean;
    followMode?: FollowMode;
    cursorAnchor?: CursorAnchor;
    cursorOffset?: {
      x?: number;
      y?: number;
    };
    hidden?: boolean;
    autoClose?: boolean;
    timeout?: number;
  }

  export function getNativeHostInfo(): {
    path: string;
    extraArgs?: string[];
    buildHint?: string;
  };
}
