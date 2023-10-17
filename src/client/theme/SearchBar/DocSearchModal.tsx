import React from 'react';
import { Footer } from './Footer';
import { SearchBox } from './SearchBox';
import { useTrapFocus } from './useTrapFocus';

export type DocSearchModalProps = {
  onClose?: () => void;
};

export function DocSearchModal(props: DocSearchModalProps) {

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const modalRef = React.useRef<HTMLDivElement | null>(null);
  const formElementRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const snippetLength = React.useRef<number>(10);
  const initialQueryFromSelection = React.useRef(
    typeof window !== 'undefined'
      ? window.getSelection()!.toString().slice(0, 64)
      : ''
  ).current;
  const initialQuery = React.useRef(
    initialQueryFromSelection
  ).current;

  useTrapFocus({ container: containerRef.current });

  React.useEffect(() => {
    document.body.classList.add('DocSearch--active');

    return () => {
      document.body.classList.remove('DocSearch--active');

      // IE11 doesn't support `scrollTo` so we check that the method exists
      // first.
      //   window.scrollTo?.(0, initialScrollY);
    };
  }, []);

  React.useEffect(() => {
    const isMobileMediaQuery = window.matchMedia('(max-width: 750px)');

    if (isMobileMediaQuery.matches) {
      snippetLength.current = 5;
    }
  }, []);

  // We rely on a CSS property to set the modal height to the full viewport height
  // because all mobile browsers don't compute their height the same way.
  // See https://css-tricks.com/the-trick-to-viewport-units-on-mobile/
  React.useEffect(() => {
    function setFullViewportHeight() {
      if (modalRef.current) {
        const vh = window.innerHeight * 0.01;
        modalRef.current.style.setProperty('--docsearch-vh', `${vh}px`);
      }
    }

    setFullViewportHeight();

    window.addEventListener('resize', setFullViewportHeight);

    return () => {
      window.removeEventListener('resize', setFullViewportHeight);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={[
        'DocSearch',
        'DocSearch-Container',
      ]
        .filter(Boolean)
        .join(' ')}
      role="button"
      tabIndex={0}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          //@ts-ignore
          props.onClose();
        }
      }}
    >
      <div className="DocSearch-Modal" ref={modalRef}>
        <header className="DocSearch-SearchBar" ref={formElementRef}>
          <SearchBox
            autoFocus={initialQuery.length === 0}
            inputRef={inputRef}
            isFromSelection={
              Boolean(initialQuery) &&
              initialQuery === initialQueryFromSelection
            }
          />
        </header>
        <footer className="DocSearch-Footer">
          <Footer />
        </footer>
      </div>
    </div>
  );
}