import React, { useState, useRef, useCallback } from 'react';
// @ts-ignore
import { createPortal } from 'react-dom';
import {
  useDocSearchKeyboardEvents,
} from './useDocSearchKeyboardEvents';
import { DocSearchButton } from './DocSearchButton';
// @ts-ignore
import { useContextualSearchFilters } from '@docusaurus/theme-common';
import { DocSearchModal } from './DocSearchModal';

export function useTypesenseContextualFilters(): string {
  const { locale, tags } = useContextualSearchFilters();
  const languageFilter = `language:=${locale}`;

  let tagsFilter;
  if (tags.length > 0) {
    tagsFilter = `docusaurus_tag:=[${tags.join(',')}]`;
  }

  return [languageFilter, tagsFilter].filter((e) => e).join(' && ');
}

function DocSearch() {
  const searchContainer = useRef<HTMLDivElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);


  const onOpen = useCallback(() => {
    setIsOpen(true);
  }, [setIsOpen]);

  const onClose = useCallback(() => {
    setIsOpen(false);
    searchContainer.current?.remove();
  }, [setIsOpen]);

  const onInput = useCallback(
    (event: KeyboardEvent) => {
      setIsOpen(true);
    },
    [setIsOpen],
  );

  useDocSearchKeyboardEvents({
    isOpen,
    onOpen,
    onClose,
    onInput,
    searchButtonRef,
  });
  return (
    <>
      <DocSearchButton
        onClick={onOpen}
        ref={searchButtonRef}
      />
      {isOpen &&
        createPortal(
          <DocSearchModal
            onClose={onClose}
          />,
          document.body
        )}
    </>
  );
}

export default function SearchBar(): JSX.Element {
  return (
    <DocSearch />
  );
}

