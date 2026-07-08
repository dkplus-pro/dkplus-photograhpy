import { useEffect, useMemo, useRef, useState } from "react";

export interface VirtualRow<T> {
  index: number;
  items: T[];
  top: number;
}

const getColumns = (width: number): number => {
  if (width >= 1280) return 4;
  if (width >= 860) return 3;
  if (width >= 560) return 2;
  return 1;
};

export const useVirtualRows = <T>(
  items: T[],
  rowHeight?: number,
  gap = 10,
  overscan = 5,
) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollY: window.scrollY,
  });
  const [container, setContainer] = useState({
    width: window.innerWidth,
    top: 0,
  });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setViewport({
          width: window.innerWidth,
          height: window.innerHeight,
          scrollY: window.scrollY,
        });
      });
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        setContainer({
          width: rect.width || window.innerWidth,
          top: rect.top + window.scrollY,
        });
      });
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return useMemo(() => {
    const columns = getColumns(container.width || viewport.width);
    const rows: T[][] = [];
    for (let index = 0; index < items.length; index += columns) {
      rows.push(items.slice(index, index + columns));
    }

    const measuredRowHeight =
      rowHeight ??
      (container.width > 0
        ? Math.max(1, (container.width - gap * (columns - 1)) / columns)
        : 240);
    const stride = measuredRowHeight + gap;
    const totalHeight = rows.length
      ? rows.length * measuredRowHeight + (rows.length - 1) * gap
      : 0;
    const start = Math.max(
      0,
      Math.floor((viewport.scrollY - container.top) / stride) - overscan,
    );
    const end = Math.min(
      rows.length,
      Math.ceil((viewport.scrollY + viewport.height - container.top) / stride) +
        overscan,
    );

    return {
      containerRef,
      columns,
      totalHeight,
      rows: rows.slice(start, end).map((row, offset) => ({
        index: start + offset,
        items: row,
        top: (start + offset) * stride,
      })) as VirtualRow<T>[],
    };
  }, [container, gap, items, overscan, rowHeight, viewport]);
};
