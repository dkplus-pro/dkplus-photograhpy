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
  rowHeight: number,
  gap = 8,
  overscan = 5,
) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollY: window.scrollY,
    topOffset: 0,
  });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const topOffset = containerRef.current
          ? containerRef.current.getBoundingClientRect().top + window.scrollY
          : 0;
        setViewport({
          width: window.innerWidth,
          height: window.innerHeight,
          scrollY: window.scrollY,
          topOffset,
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
    const stride = rowHeight + gap;
    const start = Math.max(
      0,
      Math.floor((viewport.scrollY - viewport.topOffset) / stride) - overscan,
    );
    const end = Math.min(
      rows.length,
      Math.ceil(
        (viewport.scrollY + viewport.height - viewport.topOffset) / stride,
      ) + overscan,
    );
    return {
      containerRef,
      columns,
      containerRef,
      totalHeight: rows.length * stride,
      rows: rows.slice(start, end).map((row, offset) => ({
        index: start + offset,
        items: row,
        top: (start + offset) * stride,
      })) as VirtualRow<T>[],
    };
  }, [container, gap, items, overscan, rowHeight, viewport]);
};
