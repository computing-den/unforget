import React, { useCallback, useState, useEffect, useRef } from 'react';

export type MenuItem = {
  isHeader?: boolean;
  hasTopSeparator?: boolean;
  label: string;
  icon: string;
  onClick?: () => any;
};

export type MenuProps = { menu: MenuItem[]; side: 'left' | 'right' | 'center'; onClose: () => any; trigger?: string };

export function Menu(props: MenuProps) {
  const menuItemClicked = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
      props.menu[Number((e.target as HTMLAnchorElement).dataset.menuIndex)].onClick?.();
    },
    [props.menu, props.onClose],
  );

  useEffect(() => {
    function callback(e: MouseEvent) {
      const target = e.target as HTMLElement | undefined;
      const clickedOnTrigger = props.trigger && target?.closest(props.trigger);
      const clickedOnMenu = target?.closest('.menu');
      if (!clickedOnTrigger && !clickedOnMenu) props.onClose();
    }
    window.addEventListener('mousedown', callback);
    return () => window.removeEventListener('mousedown', callback);
  }, [props.trigger, props.onClose]);

  return (
    <div className={`menu ${props.side}`}>
      <ul>
        {props.menu.map<React.ReactNode>((item, i) =>
          item.isHeader ? (
            <li key={i} className="header">
              {item.label}
              <img src={item.icon} />
            </li>
          ) : (
            <li key={i} className={item.hasTopSeparator ? 'has-top-separator' : ''}>
              <a href="#" onClick={menuItemClicked} className="reset" data-menu-index={i}>
                {item.label}
                <img src={item.icon} />
              </a>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
