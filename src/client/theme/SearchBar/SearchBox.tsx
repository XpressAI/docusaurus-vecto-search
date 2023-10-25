import type { MutableRefObject } from 'react';
import React from 'react';
import { LoadingIcon } from '../../icons/LoadingIcon';
import { ResetIcon } from '../../icons/ResetIcon';
import { SearchIcon } from '../../icons/SearchIcon';
import "./custom.css"

export type SearchBoxTranslations = Partial<{
  resetButtonTitle: string;
  resetButtonAriaLabel: string;
  cancelButtonText: string;
  cancelButtonAriaLabel: string;
}>;

interface SearchBoxProps {
  autoFocus: boolean;
  inputRef: MutableRefObject<HTMLInputElement | null>;
  isFromSelection: boolean;
  translations?: SearchBoxTranslations;
}

export function SearchBox({ translations = {}, ...props }: SearchBoxProps) {
  const {
    resetButtonTitle = 'Clear the query',
    resetButtonAriaLabel = 'Clear the query',
    cancelButtonText = 'Cancel',
    cancelButtonAriaLabel = 'Cancel',
  } = translations;
  const [searchQuery, setSearchQuery] = React.useState("");
  const onReset = () => {
    setSearchQuery("");
  }
  React.useEffect(() => {
    if (props.autoFocus && props.inputRef.current) {
      props.inputRef.current.focus();
    }
  }, [props.autoFocus, props.inputRef]);

  React.useEffect(() => {
    if (props.isFromSelection && props.inputRef.current) {
      props.inputRef.current.select();
    }
  }, [props.isFromSelection, props.inputRef]);
  return (
    <>
      <form
        className="DocSearch-Form"
        method="get"
        id="VectoSearchBox"
        action="/search"
        onReset={onReset}
      >
        <label className="DocSearch-MagnifierLabel">
          <SearchIcon />
        </label>

        <div className="DocSearch-LoadingIndicator">
          <LoadingIcon />
        </div>

        <input
          className="DocSearch-Input"
          ref={props.inputRef}
          name='q'
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <button
          type="reset"
          title={resetButtonTitle}
          className="DocSearch-Reset"
          aria-label={resetButtonAriaLabel}
          hidden={searchQuery.length == 0}
        >
          <ResetIcon />
        </button>
      </form>

      <button
        className="DocSearch-Cancel"
        type="reset"
        aria-label={cancelButtonAriaLabel}
      >
        {cancelButtonText}
      </button>
    </>
  );
}