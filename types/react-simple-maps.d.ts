declare module 'react-simple-maps' {
  import { ComponentType, SVGProps, MouseEvent } from 'react';

  interface ProjectionConfig {
    scale?: number;
    center?: [number, number];
    rotate?: [number, number, number];
  }

  interface ComposableMapProps {
    projection?: string;
    projectionConfig?: ProjectionConfig;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }

  interface GeographiesProps {
    geography: string | object;
    children: (props: { geographies: any[] }) => React.ReactNode;
  }

  interface GeographyProps extends SVGProps<SVGPathElement> {
    geography: any;
    style?: {
      default?: React.CSSProperties;
      hover?: React.CSSProperties;
      pressed?: React.CSSProperties;
    };
    onMouseMove?: (event: any) => void;
    onMouseLeave?: (event: any) => void;
    onClick?: (event: any) => void;
  }

  export const ComposableMap: ComponentType<ComposableMapProps>;
  export const Geographies: ComponentType<GeographiesProps>;
  export const Geography: ComponentType<GeographyProps>;
  export const ZoomableGroup: ComponentType<any>;
  export const Marker: ComponentType<any>;
  export const Line: ComponentType<any>;
  export const Annotation: ComponentType<any>;
  export const Sphere: ComponentType<any>;
  export const Graticule: ComponentType<any>;
}
