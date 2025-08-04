import { translate } from "@docusaurus/Translate";
import styles from "./SearchBar.module.css";

// Simple loading spinner icon (you can replace with your preferred icon)
const iconLoading = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="31.416" stroke-dashoffset="31.416">
    <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
    <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
  </circle>
</svg>`;

export function LoadingTemplate(): string {
  return `<span class="${styles.loadingResults}"><span class="${
    styles.loadingResultsIcon
  }">${iconLoading}</span><span>${translate({
    id: "theme.SearchBar.loadingText",
    message: "Searching...",
  })}</span></span>`;
}