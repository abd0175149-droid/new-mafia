declare namespace JSX {
  interface IntrinsicElements {
    'dotlottie-player': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      src?: string;
      autoplay?: boolean;
      loop?: boolean;
      speed?: string;
      direction?: string;
      mode?: string;
      background?: string;
    }, HTMLElement>;
  }
}
