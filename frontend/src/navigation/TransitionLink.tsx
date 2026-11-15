import type { MouseEvent } from "react";
import { Link, type LinkProps } from "react-router";
import { useGo } from "./viewTransition";

/**
 * A real link (middle-click, copy address and the like still work) whose
 * plain clicks navigate through a view transition.
 */
export function TransitionLink({ to, state, replace, onClick, ...rest }: LinkProps) {
    const go = useGo();
    function handleClick(e: MouseEvent<HTMLAnchorElement>) {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (rest.target && rest.target !== "_self") return;
        e.preventDefault();
        go(to, { state, replace });
    }
    return <Link to={to} state={state} replace={replace} onClick={handleClick} {...rest} />;
}
