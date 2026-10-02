/** What each "Grow your reputation" step needs to render, as a page or
 * inside the right-hand pane. */
export interface OffensiveMoveProps {
  id: string;
  /** Back to the playbook's three steps. */
  onBack: () => void;
  /** Inside the pane: no page-width container or page padding of its own. */
  embedded?: boolean;
}
