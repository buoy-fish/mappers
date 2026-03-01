import React, { useCallback, useEffect, useRef } from 'react'

function WelcomeModal(props) {
    const modalRef = useRef(null);

    // Close on click outside the modal content
    const handleBackdropClick = useCallback((e) => {
        if (modalRef.current && !modalRef.current.contains(e.target)) {
            props.onCloseWelcomeModalClick();
        }
    }, [props.onCloseWelcomeModalClick]);

    // Close on Escape key
    useEffect(() => {
        if (!props.showWelcomeModal) return;
        const handleKey = (e) => {
            if (e.key === 'Escape') props.onCloseWelcomeModalClick();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [props.showWelcomeModal, props.onCloseWelcomeModalClick]);

    if (!props.showWelcomeModal) return null;

    return (
        <div className="modal-backdrop" onClick={handleBackdropClick}>
            <div className="modal" ref={modalRef}>
                <div className="modal-logo">
                    <img src="/images/logo-buoy-fish.svg" alt="Buoy.Fish" className="modal-logo-img" />
                </div>
                <h1 className="modal-title">Coverage Map</h1>
                <button aria-label="Close intro window" className="close-button modal-close" type="button" onClick={props.onCloseWelcomeModalClick}>
                    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <path d="M7.9998 6.54957L13.4284 1.12096C13.8289 0.720422 14.4783 0.720422 14.8789 1.12096C15.2794 1.5215 15.2794 2.1709 14.8789 2.57144L9.45028 8.00004L14.8789 13.4287C15.2794 13.8292 15.2794 14.4786 14.8789 14.8791C14.4783 15.2797 13.8289 15.2797 13.4284 14.8791L7.9998 9.45052L2.57119 14.8791C2.17065 15.2797 1.52125 15.2797 1.12072 14.8791C0.720178 14.4786 0.720178 13.8292 1.12072 13.4287L6.54932 8.00004L1.12072 2.57144C0.720178 2.1709 0.720178 1.5215 1.12072 1.12096C1.52125 0.720422 2.17065 0.720422 2.57119 1.12096L7.9998 6.54957Z"/>
                    </svg>
                </button>

                <p className="modal-copy">Explore LoRaWAN coverage mapped by Buoy.Fish devices. Click on a hex to see which gateways heard the signal, signal strength, and distance.</p>
                <p className="modal-copy">Visit <a href="https://buoy.fish" target="_blank" rel="noopener noreferrer">buoy.fish</a> to learn more or check out the project on <a href="https://github.com/buoy-fish/mappers" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
            </div>
        </div>
    )
}

export default WelcomeModal
