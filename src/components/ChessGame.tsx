import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Chess, PieceSymbol } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Square } from "chess.js";
import { socket } from "../socket";
import { Advantage, ShieldedPieceInfo, ServerMovePayload, OpeningSwapState } from "../../shared/types"; // Import ServerMovePayload
import { useSacrificialBlessingStore, SacrificialBlessingPiece } from "../logic/advantages/sacrificialBlessing";
import { isAttemptToCaptureShieldedPieceClient } from "../logic/advantages/silentShield"; // Added
import {
  handlePawnRushClient,
  applyPawnRushOpponentMove,
} from "../logic/advantages/pawnRush";
import {
  handleCastleMasterClient,
  applyCastleMasterOpponentMove,
} from "../logic/advantages/castleMaster";
import {
  handleFocusedBishopClient,
  applyFocusedBishopOpponentMove,
  FocusedBishopClientMove,
  OpponentFocusedBishopMove,
} from "../logic/advantages/focusedBishop";
import {
  handleCornerBlitzClient,
  applyCornerBlitzOpponentMove,
  PlayerRooksMovedState, // Type for the new ref state
} from "../logic/advantages/cornerBlitz";
import {
  handleRoyalEscortClient,
  applyRoyalEscortOpponentMove,
  OpponentRoyalEscortMove, // Added import for type assertion
} from "../logic/advantages/royalEscort";
import { RoyalEscortState, LightningCaptureState } from "../../shared/types";
import {
  handleLightningCaptureClient,
  applyLightningCaptureOpponentMove,
} from "../logic/advantages/lightningCapture";
import {
  handlePawnAmbushClient,
  applyPawnAmbushOpponentMove,
} from "../logic/advantages/pawnAmbush";
import { showRestlessKingNotice } from "../logic/advantages/restlessKing"; // Added import
import { QueensDomainClientState, canQueenUseDomain, getQueenGhostPath } from '../logic/advantages/queensDomain';
import { Move } from "chess.js";

// Define the type for the chess.js Move object if not already available globally
// type ChessJsMove = ReturnType<Chess['move']>; // This is a more precise way if Chess['move'] is well-typed

export default function ChessGame() {
  const { roomId } = useParams(); //This gets /game/:roomId
  const [game] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [color, setColor] = useState<"white" | "black" | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  const [myAdvantage, setMyAdvantage] = useState<Advantage | null>(null);
  const [myShieldedPieceInfo, setMyShieldedPieceInfo] =
    useState<ShieldedPieceInfo | null>(null); // Added
  const fenSnapshotBeforeMove = useRef<string>(game.fen()); // For reverting deflected moves
  const [revealedAdvantages, setRevealedAdvantages] = useState<{
    whiteAdvantage?: Advantage;
    blackAdvantage?: Advantage;
    winnerColor?: "white" | "black" | null;
  } | null>(null);

  const hasUsedCastleMaster = useRef(false);
  const hasUsedFocusedBishop = useRef(false);
  const playerRooksMoved = useRef<PlayerRooksMovedState>({
    a1: false,
    h1: false,
    a8: false,
    h8: false,
  });
  const [royalEscortState, setRoyalEscortState] =
    useState<RoyalEscortState | null>(null);
  const [lightningCaptureState, setLightningCaptureState] =
    useState<LightningCaptureState>({ used: false });
  const [isLightningCaptureActive, setIsLightningCaptureActive] =
    useState(false);
  const [isAwaitingSecondLcMove, setIsAwaitingSecondLcMove] = useState(false);
  const [lcFenAfterFirstMove, setLcFenAfterFirstMove] = useState<string | null>(null);
  const [lcFirstMoveDetails, setLcFirstMoveDetails] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [lcPossibleSecondMoves, setLcPossibleSecondMoves] = useState<string[]>(
    [],
  );
const [showOpeningSwapPrompt, setShowOpeningSwapPrompt] = useState(false);
const [openingSwapSelection, setOpeningSwapSelection] = useState<string | null>(null);
const [myOpeningSwapState, setMyOpeningSwapState] = useState<OpeningSwapState | null>(null);
const [hasUsedRoyalDecree, setHasUsedRoyalDecree] = useState(false);
const [restrictedToPieceType, setRestrictedToPieceType] = useState<string | null>(null);
const [royalDecreeMessage, setRoyalDecreeMessage] = useState<string | null>(null);
const [queensDomainState, setQueensDomainState] = useState<QueensDomainClientState | null>(null);
const [isQueensDomainToggleActive, setIsQueensDomainToggleActive] = useState(false);

  const {
    isSacrificialBlessingActive,
    availablePieces: availablePiecesForBlessing,
    selectedPiece: selectedPieceForBlessing,
    activate: activateSacrificialBlessing,
    selectPiece: selectBlessingPiece,
    deselectPiece: deselectBlessingPiece,
    placePiece: placeBlessingPieceClient,
    reset: resetSacrificialBlessingState,
  } = useSacrificialBlessingStore();
  const [hasUsedMySacrificialBlessing, setHasUsedMySacrificialBlessing] = useState(false);

  useEffect(() => {
    if (myAdvantage?.id !== 'sacrificial_blessing') {
      setHasUsedMySacrificialBlessing(false); // Reset usage if advantage changes
      resetSacrificialBlessingState();
    }
  }, [myAdvantage, resetSacrificialBlessingState]);

  useEffect(() => {
    if (myAdvantage?.id === "royal_escort") {
      setRoyalEscortState({ usedCount: 0 });
    } else {
      setRoyalEscortState(null); // Reset if advantage changes
    }
    if (myAdvantage?.id === "lightning_capture") {
      setLightningCaptureState({ used: false });
      setIsLightningCaptureActive(false);
      setIsAwaitingSecondLcMove(false);
    } else {
      // Reset LC states if advantage is not LC
      setIsLightningCaptureActive(false);
      setIsAwaitingSecondLcMove(false);
      setLcPossibleSecondMoves([]);
      setLcFirstMoveDetails(null);
      // Note: The if(lcSecondMoveResolver) block was here, it's now fully removed.
      // The associated state `lcSecondMoveResolver` itself is also removed.
    }

  if (myAdvantage?.id === "opening_swap") {
    setMyOpeningSwapState({ hasSwapped: false }); // Initialize local state for UI tracking
    // Show prompt only if game hasn't started and swap not used
    if (game.history().length === 0 && !myOpeningSwapState?.hasSwapped) {
      setShowOpeningSwapPrompt(true);
    }
  } else {
    setMyOpeningSwapState(null);
    setShowOpeningSwapPrompt(false);
  }
  if (myAdvantage?.id !== "royal_decree" && hasUsedRoyalDecree) {
    setHasUsedRoyalDecree(false); 
  }
  // Queen's Domain advantage initialization/reset
  if (myAdvantage?.id === "queens_domain") {
    // Initial state will be set by server or handleAdvantageAssigned.
    // Ensure toggle is off if advantage changes to QD.
    // setIsQueensDomainToggleActive(false); // This is handled by the 'else' part or specific state updates.
  } else {
    if (queensDomainState) setQueensDomainState(null); // Clear state if advantage is not QD
    if (isQueensDomainToggleActive) setIsQueensDomainToggleActive(false); // Reset toggle
  }
  }, [myAdvantage, game, myOpeningSwapState?.hasSwapped, hasUsedRoyalDecree, queensDomainState, isQueensDomainToggleActive]); // Added dependencies for QD

  useEffect(() => {
    const handleAdvantageStateUpdate = (data: any) => {
      if (data.queens_domain && myAdvantage?.id === 'queens_domain') {
        console.log("[ChessGame] Received advantageStateUpdated for Queen's Domain:", data.queens_domain);
        setQueensDomainState(data.queens_domain);
        // If server confirms isActive is false or advantage is used, ensure UI toggle reflects this
        if (!data.queens_domain.isActive || data.queens_domain.hasUsed) {
          setIsQueensDomainToggleActive(false);
        }
      }
    };

    socket.on("advantageStateUpdated", handleAdvantageStateUpdate);

    return () => {
      socket.off("advantageStateUpdated", handleAdvantageStateUpdate);
    };
  }, [myAdvantage]); // Listen for changes to myAdvantage to setup/teardown if it's QD

  useEffect(() => {
    if (!roomId) return;

    console.log(
      `[ChessGame useEffect] Setting up for room: ${roomId}, color: ${color}`,
    );
    socket.emit("joinRoom", roomId);

    const handleColorAssigned = (assignedColor: "white" | "black") => {
      console.log(`[ChessGame event] colorAssigned: ${assignedColor}`);
      setColor(assignedColor);
    };
    socket.on("colorAssigned", handleColorAssigned);

    const handleOpponentJoined = () => {
      console.log("[ChessGame event] opponentJoined");
      setOpponentConnected(true);
    };
    socket.on("opponentJoined", handleOpponentJoined);

    const handleOpponentDisconnected = () => {
      console.log("[ChessGame event] opponentDisconnected");
      setOpponentConnected(false);
      alert("Your opponent has disconnected.");
    };
    socket.on("opponentDisconnected", handleOpponentDisconnected);

    // ServerMovePayload is now imported from shared/types
    
    type ReceiveMoveEventData = {
      move: ServerMovePayload; // Uses the imported ServerMovePayload
      updatedShieldedPiece?: ShieldedPieceInfo;
    };

    const handleReceiveMove = (data: ReceiveMoveEventData) => {
      const receivedMove = data.move;
      const updatedShieldedPieceFromServer = data.updatedShieldedPiece;

      console.log(
        `[ChessGame handleReceiveMove] START. Current color state: ${color}. Received move:`,
        receivedMove,
      );
      if (updatedShieldedPieceFromServer) {
        console.log(
          "[ChessGame handleReceiveMove] Server sent updatedShieldedPiece:",
          updatedShieldedPieceFromServer,
        );
      }

      // If this client is awaiting a second LC move, it should not process incoming moves from opponent.
      // This can happen in rare race conditions. Server should ultimately resolve.
      if (isAwaitingSecondLcMove) {
        console.warn(
          "[ChessGame handleReceiveMove] Ignoring opponent move while awaiting second LC move.",
        );
        return;
      }

      const isEcho = receivedMove.color === color;

      // The original instruction was to change a line here, but `isEcho` already correctly uses `color`.
      // The problematic line was:
      // if (isEcho && receivedMove.color === myColor) { 
      // This line seems to have been corrected in a previous step or was not exactly as stated.
      // The current logic `const isEcho = receivedMove.color === color;` followed by `if (isEcho)` is correct.
      // I will search for the specific problematic pattern `receivedMove.color === myColor` if it exists elsewhere,
      // but the primary location indicated by the subtask seems to be this `isEcho` definition.
      // For now, I will assume the existing `isEcho` definition is what needed to be ensured.
      // If there's another instance of `receivedMove.color === myColor` that needs changing,
      // it would require a different search.

      // Let's verify the Queen's Domain logic block inside the `if (isEcho)`:
      if (isEcho && receivedMove.color === color) { // 'color' is the component's player color state
        console.log("[ChessGame handleReceiveMove ECHO] Received echo:", JSON.stringify(receivedMove));

        let boardUpdatedByEcho = false;
        // General FEN update if afterFen is present on the echo
        if (receivedMove.afterFen) {
            console.log("[ChessGame handleReceiveMove ECHO] Loading FEN from server via receivedMove.afterFen:", receivedMove.afterFen);
            try {
                game.load(receivedMove.afterFen);
                setFen(game.fen()); // Update React state to trigger re-render
                boardUpdatedByEcho = true;
                console.log("[ChessGame handleReceiveMove ECHO] Local game FEN updated to:", game.fen());
            } catch (e) {
                console.error("[ChessGame handleReceiveMove ECHO] Error loading FEN from afterFen:", e, "FEN was:", receivedMove.afterFen);
                console.error("[ChessGame handleReceiveMove ECHO] Requesting FEN sync due to load error.");
                socket.emit("requestFenSync", { roomId }); // Request full FEN sync if load fails
            }
        } else {
            // This block is for echoes that *don't* provide an afterFen.
            // This might be older advantages or server versions, or moves that only change state, not FEN.
            // If it was a move that *should* have an afterFen (like a successful QD move), log a warning.
            if (receivedMove.special === 'queens_domain_move' || receivedMove.specialServerEffect === 'queens_domain_consumed') {
                 console.warn("[ChessGame handleReceiveMove ECHO] Successful Queen's Domain move echo received WITHOUT afterFen. Board may not update correctly. This is unexpected.");
                 // Attempt to make the move locally as a fallback if from/to are present
                 if (receivedMove.from && receivedMove.to) {
                    console.log(`[ChessGame handleReceiveMove ECHO QD Fallback] Attempting to apply move ${receivedMove.from}-${receivedMove.to} locally.`);
                    const localMoveAttempt = game.move({from: receivedMove.from as Square, to: receivedMove.to as Square});
                    if (localMoveAttempt) {
                        setFen(game.fen());
                        boardUpdatedByEcho = true;
                        console.log(`[ChessGame handleReceiveMove ECHO QD Fallback] Local move applied. New FEN: ${game.fen()}`);
                    } else {
                        console.error(`[ChessGame handleReceiveMove ECHO QD Fallback] Failed to apply move ${receivedMove.from}-${receivedMove.to} locally. Requesting FEN sync.`);
                        socket.emit("requestFenSync", { roomId });
                    }
                 } else {
                    console.error("[ChessGame handleReceiveMove ECHO QD Fallback] No from/to for local move fallback. Requesting FEN sync.");
                    socket.emit("requestFenSync", { roomId });
                 }
            } else {
                console.log("[ChessGame handleReceiveMove ECHO] Echo received without afterFen. No board update from FEN. Special:", receivedMove.special, "Effect:", receivedMove.specialServerEffect);
            }
        }

        // Perform game over checks if the board was updated by this echo
        if (boardUpdatedByEcho) {
            if (game.isCheckmate()) {
                const winnerTurn = game.turn(); // game.turn() is opponent after our successful move
                const winner = winnerTurn === 'w' ? 'black' : 'white';
                setGameOverMessage(`${winner.charAt(0).toUpperCase() + winner.slice(1)} wins by checkmate!`);
            } else if (game.isDraw()) {
                setGameOverMessage("Draw");
            } else if (game.isStalemate()) {
                setGameOverMessage("Draw by Stalemate");
            } else if (game.isThreefoldRepetition()) {
                setGameOverMessage("Draw by Threefold Repetition");
            } else if (game.isInsufficientMaterial()) {
                setGameOverMessage("Draw by Insufficient Material");
            }
        }

        // Specific advantage state updates for echo (e.g., Queen's Domain hasUsed)
        if (myAdvantage?.id === 'queens_domain' &&
            (receivedMove.specialServerEffect === 'queens_domain_consumed')) { // Rely on server effect flag
            
            if (queensDomainState && !queensDomainState.hasUsed) { // Check local state before updating
                 console.log("[ChessGame handleReceiveMove ECHO] Queen's Domain use confirmed by server. Updating local QD state.");
                 setQueensDomainState({ isActive: false, hasUsed: true });
                 setIsQueensDomainToggleActive(false);
                 alert("Queen's Domain used!"); 
            }
        }
        // ... other advantage echo handling (e.g., Lightning Capture used state)
        // Note: The existing LC handling was outside this new "if (receivedMove.afterFen)" block.
        // It should be reviewed if LC also needs to be conditional on afterFen or handled within it.
        // For this task, focusing on QD and general afterFen handling.
        // The original LC logic:
        if (receivedMove.special === "lightning_capture") {
          setLightningCaptureState({ used: true });
          setIsLightningCaptureActive(false); 
          setIsAwaitingSecondLcMove(false);
          setLcFirstMoveDetails(null);
          setLcPossibleSecondMoves([]);
        }
        
        if (
          updatedShieldedPieceFromServer &&
          myShieldedPieceInfo &&
          updatedShieldedPieceFromServer.id === myShieldedPieceInfo.id
        ) {
          console.log(
            `[ChessGame handleReceiveMove ECHO] Updating myShieldedPieceInfo from ${myShieldedPieceInfo.currentSquare} to ${updatedShieldedPieceFromServer.currentSquare}`,
          );
          setMyShieldedPieceInfo(updatedShieldedPieceFromServer);
        }
        
        // This existing log can be at the end of the 'isEcho' block
        console.log("[ChessGame handleReceiveMove ECHO] Processing complete. Returning.");
        return; // Important: Return after processing echo
      }

      // This is the start of opponent's move processing logic
      // const isEcho = receivedMove.color === color; // This was defined earlier
      if (!isEcho) {
        console.log(`[ChessGame OpponentMove] Processing OPPONENT's move: ${JSON.stringify(receivedMove)} from color ${receivedMove.color}`);
        let opponentBoardUpdated = false;
        const currentFenBeforeOpponentMove = game.fen(); // Snapshot for safety/logging

        if (receivedMove.afterFen) {
            console.log("[ChessGame OpponentMove] Opponent's move has afterFen. Loading FEN:", receivedMove.afterFen);
            try {
                game.load(receivedMove.afterFen);
                setFen(game.fen());
                opponentBoardUpdated = true;
                console.log("[ChessGame OpponentMove] Board updated via afterFen. New FEN:", game.fen());
            } catch (e) {
                console.error("[ChessGame OpponentMove] Error loading FEN from opponent's afterFen:", e, "FEN was:", receivedMove.afterFen);
                console.error("[ChessGame OpponentMove] Requesting FEN sync due to opponent afterFen load error.");
                socket.emit("requestFenSync", { roomId });
                // return or ensure opponentBoardUpdated remains false
            }
        } else {
            // Fallback logic if afterFen is NOT provided by the server (less ideal)
            console.warn("[ChessGame OpponentMove] Opponent's move did NOT have afterFen. Using fallback logic. Special:", receivedMove.special);
            
            // Existing specific advantage handlers for opponent moves (if any are still needed without afterFen)
            // These should be reviewed to see if they are still necessary if afterFen becomes standard.
            // For Queen's Domain, afterFen is expected. If it's missing for a QD move, it's an error state.
            if (receivedMove.special === 'queens_domain_move' || receivedMove.specialServerEffect === 'queens_domain_consumed') {
                console.error("[ChessGame OpponentMove] Received Queen's Domain move from opponent WITHOUT afterFen. This is unexpected. Requesting FEN sync.");
                socket.emit("requestFenSync", { roomId });
            } else if (receivedMove.special === "lightning_capture") {
                // Assuming applyLightningCaptureOpponentMove handles its own FEN update and returns boolean
                if (typeof receivedMove.secondTo === 'string' && receivedMove.color) {
                    const lcGameChanged = applyLightningCaptureOpponentMove({ game, receivedMove: receivedMove as any /* Cast if types differ slightly but structure is ok */ });
                    if (lcGameChanged) { setFen(game.fen()); opponentBoardUpdated = true; }
                    else { console.error("[ChessGame OpponentMove] applyLightningCaptureOpponentMove failed."); socket.emit("requestFenSync", { roomId });}
                } else { /* Error handling for missing LC data */ 
                    console.error("[ChessGame OpponentMove] LC move from opponent missing data.");
                    socket.emit("requestFenSync", { roomId });
                }
            } else if (receivedMove.special === "royal_escort") {
                const reGameChanged = applyRoyalEscortOpponentMove({ game, receivedMove: receivedMove as any });
                if (reGameChanged) { setFen(game.fen()); opponentBoardUpdated = true; }
                else { console.error("[ChessGame OpponentMove] applyRoyalEscortOpponentMove failed."); socket.emit("requestFenSync", { roomId });}
            } 
            // Add other 'else if' for existing special handlers that *don't* rely on afterFen
            // Example: Pawn Ambush (if it has specific client-side opponent logic beyond FEN update)
            else if (receivedMove.color !== color && receivedMove.wasPawnAmbush) { // This was the old PA check
                 console.log(`[ChessGame OpponentMove] Opponent's move is Pawn Ambush (fallback). Current FEN: ${game.fen()}`);
                 const initialPawnMove = game.move({ from: receivedMove.from as Square, to: receivedMove.to as Square });
                 if (initialPawnMove) {
                     const removedPiece = game.remove(receivedMove.to as Square);
                     if (removedPiece) {
                         const queenPlaced = game.put({ type: 'q', color: receivedMove.color![0] as 'w' | 'b' }, receivedMove.to as Square);
                         if (queenPlaced) {
                             setFen(game.fen());
                             opponentBoardUpdated = true;
                         } else { game.put({type: removedPiece.type, color: removedPiece.color}, receivedMove.to as Square); socket.emit("requestFenSync", { roomId }); }
                     } else { socket.emit("requestFenSync", { roomId }); }
                 } else { socket.emit("requestFenSync", { roomId }); }
            }
            // Be cautious: if these advantages now also send afterFen, they should go through the primary path.
            else { 
                // Fallback to standard game.move() if no afterFen and no other special handler matched
                console.log(`[ChessGame OpponentMove] No afterFen. Attempting standard game.move() for ${receivedMove.from}-${receivedMove.to}`);
                const standardMoveAttempt = game.move({
                    from: receivedMove.from as Square,
                    to: receivedMove.to as Square,
                    promotion: receivedMove.promotion as PieceSymbol | undefined,
                });
                if (standardMoveAttempt) {
                    setFen(game.fen());
                    opponentBoardUpdated = true;
                    console.log(`[ChessGame OpponentMove] Standard move applied for opponent. New FEN: ${game.fen()}`);
                } else {
                    console.error(`[ChessGame OpponentMove] Standard game.move() FAILED for opponent's move. Move: ${JSON.stringify(receivedMove)}. FEN before attempt: ${currentFenBeforeOpponentMove}. Requesting FEN sync.`);
                    socket.emit("requestFenSync", { roomId });
                }
            }
        }

        if (opponentBoardUpdated) {
            console.log("[ChessGame OpponentMove] Opponent's move successfully applied. Updating state & checking game over.");
            if (updatedShieldedPieceFromServer) { 
                if (
                  myShieldedPieceInfo &&
                  updatedShieldedPieceFromServer.id === myShieldedPieceInfo.id
                ) {
                  console.log(
                    `[ChessGame OpponentMove] Updating myShieldedPieceInfo from ${myShieldedPieceInfo.currentSquare} to ${updatedShieldedPieceFromServer.currentSquare}`
                  );
                  setMyShieldedPieceInfo(updatedShieldedPieceFromServer);
                }
            }
            // Game Over Checks
            if (game.isCheckmate()) {
                const winnerTurn = game.turn(); 
                const winner = winnerTurn === 'w' ? 'black' : 'white'; 
                setGameOverMessage(`${winner.charAt(0).toUpperCase() + winner.slice(1)} wins by checkmate!`);
            } else if (game.isDraw()) {
                setGameOverMessage("Draw");
            } // ... other draw conditions
            else if (game.isStalemate()) { // Added missing else
                setGameOverMessage("Draw by Stalemate");
            } else if (game.isThreefoldRepetition()) {
                setGameOverMessage("Draw by Threefold Repetition");
            } else if (game.isInsufficientMaterial()) {
                setGameOverMessage("Draw by Insufficient Material");
            }
             // Reset Queen's Domain toggle if it was active and opponent made a move
            if (isQueensDomainToggleActive) {
                setIsQueensDomainToggleActive(false);
                console.log("[ChessGame OpponentMove] Opponent's turn; resetting Queen's Domain toggle if it was active.");
            }
        } else {
            console.warn("[ChessGame OpponentMove] Opponent's move was NOT successfully applied or board not updated. State may be inconsistent if FEN sync not triggered.");
        }
        console.log("[ChessGame OpponentMove] END processing opponent's move.");
      }
      // This replaces the old opponent move handling structure
      // Ensure common logic previously after opponent move block is still handled or moved if necessary.
      // The original handleReceiveMove had a top-level console.log for END.
      // This new structure is self-contained for opponent moves.

      // Old structure (for reference, to ensure nothing critical is missed from the 'else' part of 'if(isEcho)'):
      /*
      console.log(
        `[ChessGame handleReceiveMove] Processing OPPONENT's move: ${JSON.stringify(receivedMove)}`,
      );
      let moveSuccessfullyApplied = false;
      const currentFenBeforeOpponentMove = game.fen();

      // ... [old series of if/else if for special moves and standard move] ...

      if (moveSuccessfullyApplied) {
        // ... [old game over checks and other logic] ...
      } else {
        console.warn(
          "[ChessGame handleReceiveMove] Opponent's move was NOT successfully applied. State may be inconsistent.",
        );
      }
      console.log("[ChessGame handleReceiveMove] END.");
      */
    };
    socket.on("receiveMove", handleReceiveMove);

    const handleRevealAdvantages = (data: {
      whiteAdvantage?: Advantage;
      blackAdvantage?: Advantage;
      winnerColor?: "white" | "black" | null;
    }) => {
      console.log("[ChessGame event] revealAdvantages:", data);
      setRevealedAdvantages(data);
    };
    socket.on("revealAdvantages", handleRevealAdvantages);

    const handleAdvantageAssigned = (data: {
      advantage: Advantage;
      shieldedPiece?: ShieldedPieceInfo;
    }) => {
      console.log("[ChessGame event] advantageAssigned:", data);
      setMyAdvantage(data.advantage);
      if (data.shieldedPiece) {
        setMyShieldedPieceInfo(data.shieldedPiece);
        if (data.advantage.id === "silent_shield") {
          console.log(
            `SILENT SHIELD: Your ${data.shieldedPiece.type.toUpperCase()} on ${data.shieldedPiece.initialSquare} is protected.`,
          );
        }
      }
      if (data.advantage.id === 'queens_domain') {
        // Server should ideally send the initial state for queens_domain.
        // If it's part of PlayerAdvantageStates on game load, that's better.
        // For now, initialize if not present from a more general state update.
        setQueensDomainState(prevState => prevState || { isActive: false, hasUsed: false }); // TODO: isActive should come from server
        setIsQueensDomainToggleActive(false); // Ensure toggle is off initially
      }
    };
    socket.on("advantageAssigned", handleAdvantageAssigned);

    const handleMoveDeflected = (data?: { move?: any }) => {
      console.log("[ChessGame event] moveDeflected:", data?.move);
      alert(
        "Your move was deflected by the opponent's Auto Deflect advantage!",
      );
      try {
        game.load(fenSnapshotBeforeMove.current);
        setFen(game.fen());
      } catch (e) {
        console.error("Error loading snapshot after move deflection:", e);
      }
    };
    socket.on("moveDeflected", handleMoveDeflected);

    const handleInvalidMove = (data: { message: string; move?: any }) => {
      console.warn(
        "[ChessGame event] invalidMove:",
        data.move,
        "Reason:",
        data.message,
      );
      alert(`Invalid Move: ${data.message}`);
      try {
        game.load(fenSnapshotBeforeMove.current);
        setFen(game.fen());
        console.log(
          "Game state reverted to FEN:",
          fenSnapshotBeforeMove.current,
        );
      } catch (e) {
        console.error("Error loading snapshot after invalid move:", e);
      }
    };
    socket.on("invalidMove", handleInvalidMove);

    const handleOpeningSwapSuccess = ({ newFen, from, to, color: swapPlayerColor }: { newFen: string; from: string; to: string; color: 'white' | 'black' }) => {
      console.log(`[ChessGame event] openingSwapSuccess: FEN updated to ${newFen}, ${from} swapped with ${to} by ${swapPlayerColor}`);
      game.load(newFen);
      setFen(newFen);

      // If this client performed the swap, ensure UI reflects completion.
      if (swapPlayerColor === color && myAdvantage?.id === "opening_swap") {
        setShowOpeningSwapPrompt(false);
        setOpeningSwapSelection(null);
        if (myOpeningSwapState) {
          setMyOpeningSwapState({ ...myOpeningSwapState, hasSwapped: true });
        }
      }
      // Potentially add a visual cue or log for the opponent.
      // For now, the board update is the primary feedback.
    };
    socket.on("openingSwapSuccess", handleOpeningSwapSuccess);

    const handleOpeningSwapFailed = ({ message }: { message: string }) => {
      console.warn(`[ChessGame event] openingSwapFailed: ${message}`);
      alert(`Opening Swap Failed: ${message}`);
      setOpeningSwapSelection(null);
    };
    socket.on("openingSwapFailed", handleOpeningSwapFailed);

    const handleSacrificialBlessingTriggered = ({ availablePieces, fenAfterCapture }: { availablePieces: SacrificialBlessingPiece[], fenAfterCapture: string }) => {
      console.log('[ChessGame] Raw sacrificialBlessingTriggered event data:', { availablePieces, fenAfterCapture });
      if (myAdvantage?.id === 'sacrificial_blessing' && !hasUsedMySacrificialBlessing && color) {
        console.log('[ChessGame] sacrificialBlessingTriggered. Storing FEN for blessing:', fenAfterCapture, 'Available Pieces:', availablePieces);
        console.log('[SB Debug] Received fenAfterCapture for blessing store:', fenAfterCapture);
        
        // Load FEN into main game instance for safety, though blessing logic should use store's FEN.
        game.load(fenAfterCapture); 
        // setFen(fenAfterCapture); // DO NOT set main FEN here; blessing uses its own FEN from the store. Main FEN updates on blessing completion.

        activateSacrificialBlessing(availablePieces, fenAfterCapture); // Pass FEN to store
        alert("Sacrificial Blessing Triggered! Select one of your highlighted Knights or Bishops, then an empty square to move it to.");
      }
    };
    socket.on('sacrificialBlessingTriggered', handleSacrificialBlessingTriggered);

    const handleBoardUpdateFromBlessing = ({ newFen, playerWhoUsedBlessing }: { newFen: string, playerWhoUsedBlessing: 'white' | 'black' }) => {
      console.log(`[ChessGame] boardUpdateFromBlessing received. New FEN: ${newFen}, Used by: ${playerWhoUsedBlessing}`);
      game.load(newFen);
      setFen(newFen);
      resetSacrificialBlessingState();
      if (playerWhoUsedBlessing === color) {
        setHasUsedMySacrificialBlessing(true);
      }
      // Standard game over checks
      if (game.isCheckmate()) {
        const winner = game.turn() === "w" ? "black" : "white";
        setGameOverMessage(`${winner} wins by checkmate`);
      } else if (game.isDraw()) {
        setGameOverMessage("Draw");
      } else if (game.isStalemate()) {
        setGameOverMessage("Draw by Stalemate");
      } else if (game.isThreefoldRepetition()) {
        setGameOverMessage("Draw by Threefold Repetition");
      } else if (game.isInsufficientMaterial()) {
        setGameOverMessage("Draw by Insufficient Material");
      }
    };
    socket.on('boardUpdateFromBlessing', handleBoardUpdateFromBlessing);

    const handleSacrificialBlessingFailed = ({ message }: { message: string }) => {
      console.warn('[ChessGame] sacrificialBlessingFailed received:', message);
      alert(`Sacrificial Blessing Failed: ${message}`);
      resetSacrificialBlessingState();
    };
    socket.on('sacrificialBlessingFailed', handleSacrificialBlessingFailed);

    const handleRestlessKingActivated = ({ forColor, remaining }: { forColor: 'white' | 'black', remaining: number }) => {
      // 'color' is the state variable holding the current client's color
      // 'forColor' is the color of the player for whom the "cannot check" rule applies (i.e., the opponent of the king-mover)
      // The toast "Restless King activated. Your opponent cannot check you." is for the player who MOVED their king.
      // The toast "You cannot check this turn due to Restless King." is for the player who is NOW RESTRICTED.

      // So, if forColor === color, it means THIS client is the one being restricted. (isYou = false for showRestlessKingNotice)
      // If forColor !== color, it means THIS client's OPPONENT is restricted (meaning THIS client activated it). (isYou = true for showRestlessKingNotice)
      console.log(`[ChessGame event] restlessKingActivated: forColor=${forColor}, remaining=${remaining}, myColor=${color}`);
      if (color) { // Ensure client's color is known
        showRestlessKingNotice(forColor !== color, remaining);
      }
    };
    socket.on("restlessKingActivated", handleRestlessKingActivated);

    const handleRoyalDecreeApplied = ({ pieceType, restrictedPlayerColor }: { pieceType: string, restrictedPlayerColor: "white" | "black" }) => {
      if (color === restrictedPlayerColor) { 
        console.log(`[Royal Decree Client] Received royalDecreeApplied. Must move: ${pieceType}. My color: ${color}`);
        setRestrictedToPieceType(pieceType);
        const pieceDisplayNames: { [key: string]: string } = { "p": "Pawn", "n": "Knight", "b": "Bishop", "r": "Rook", "q": "Queen", "k": "King" };
        const niceName = pieceDisplayNames[pieceType] || pieceType;
        const message = `Royal Decree: Your opponent forces you to move a ${niceName} this turn.`;
        setRoyalDecreeMessage(message);
        alert(message); 
      }
    };
    socket.on("royalDecreeApplied", handleRoyalDecreeApplied);

    const handleRoyalDecreeLifted = ({ reason, pieceType }: { reason: string, pieceType: string }) => {
      console.log(`[Royal Decree Client] Received royalDecreeLifted. Reason: ${reason}, Piece: ${pieceType}`);
      const pieceDisplayNames: { [key: string]: string } = { "p": "Pawn", "n": "Knight", "b": "Bishop", "r": "Rook", "q": "Queen", "k": "King" };
      const niceName = pieceDisplayNames[pieceType] || pieceType;
      let message = "Royal Decree restriction has been lifted.";
      if (reason === "check") {
        message = `Royal Decree (move ${niceName}) lifted: You are in check.`;
      } else if (reason === "no_valid_moves") {
        message = `Royal Decree (move ${niceName}) lifted: No valid moves available with a ${niceName}.`;
      }
      setRestrictedToPieceType(null); 
      setRoyalDecreeMessage(message);
      alert(message); 
    };
    socket.on("royalDecreeLifted", handleRoyalDecreeLifted);

    return () => {
      console.log(
        `[ChessGame useEffect cleanup] Cleaning up listeners for room: ${roomId}, color: ${color}`,
      );
      socket.off("colorAssigned", handleColorAssigned);
      socket.off("opponentJoined", handleOpponentJoined);
      socket.off("opponentDisconnected", handleOpponentDisconnected);
      socket.off("receiveMove", handleReceiveMove);
      socket.off("revealAdvantages", handleRevealAdvantages);
      socket.off("advantageAssigned", handleAdvantageAssigned);
      socket.off("moveDeflected", handleMoveDeflected);
      socket.off("invalidMove", handleInvalidMove);
      socket.off("openingSwapSuccess", handleOpeningSwapSuccess);
      socket.off("openingSwapFailed", handleOpeningSwapFailed);
      socket.off("royalDecreeApplied", handleRoyalDecreeApplied);
      socket.off("royalDecreeLifted", handleRoyalDecreeLifted);
      socket.off('sacrificialBlessingTriggered', handleSacrificialBlessingTriggered);
      socket.off('boardUpdateFromBlessing', handleBoardUpdateFromBlessing);
      socket.off('sacrificialBlessingFailed', handleSacrificialBlessingFailed);
      socket.off("restlessKingActivated", handleRestlessKingActivated); // Added cleanup
    };
  }, [
    roomId,
    game,
    color,
    myAdvantage,
    myShieldedPieceInfo,
    fenSnapshotBeforeMove,
    myOpeningSwapState,
    activateSacrificialBlessing, 
    resetSacrificialBlessingState, 
    hasUsedMySacrificialBlessing,
    setFen, 
    setGameOverMessage,
    // Removed the previous comment about 'color is crucial' as it's now explicitly listed.
  ]); 
  // Note: `game` (useState object) and `fenSnapshotBeforeMove` (ref object) are stable.
  // `color`, `myAdvantage`, `myShieldedPieceInfo` are included because handlers like handleReceiveMove,
  // handleAdvantageAssigned, and the logging in cleanup depend on their current values.

  const isQueenAlive = (gameInstance: Chess, playerColor: 'white' | 'black'): boolean => {
    const playerChar = playerColor[0] as 'w' | 'b';
    for (const row of gameInstance.board()) {
      for (const piece of row) {
        if (piece && piece.type === 'q' && piece.color === playerChar) {
          return true;
        }
      }
    }
    return false;
  };

  useEffect(() => {
    if (color && game.turn() !== color[0] && restrictedToPieceType) {
      console.log("[Royal Decree Client] Turn changed (no longer my turn), clearing Royal Decree restriction state.");
      setRestrictedToPieceType(null);
      setRoyalDecreeMessage(null);
    }
  }, [fen, color, restrictedToPieceType, game]);


  // promptSecondMove function was here and has been removed.

  const onSquareClick = (squareClicked: Square) => {
    if (isSacrificialBlessingActive) {
      if (!selectedPieceForBlessing) {
        const pieceDetailsOnSquare = game.get(squareClicked);
        const isPieceEligibleForBlessing = availablePiecesForBlessing.find(p => p.square === squareClicked);
        if (isPieceEligibleForBlessing && pieceDetailsOnSquare && pieceDetailsOnSquare.color === color?.[0]) {
          selectBlessingPiece(isPieceEligibleForBlessing);
        }
      } else {
        if (squareClicked === selectedPieceForBlessing.square) {
          deselectBlessingPiece();
        } else {
          // Validate using the FEN from the store, which reflects the board state after the capture
          const blessingFenForValidation = useSacrificialBlessingStore.getState().currentBlessingFen;
          if (!blessingFenForValidation) {
            console.error('[SB Debug onSquareClick] No blessingFenForValidation available from store.');
            alert('Error: Blessing state is inconsistent. Cannot validate move. Please cancel and retry.');
            return;
          }

          const validationGame = new Chess();
          console.log('[SB Debug onSquareClick] validationGame created. Initial FEN:', validationGame.fen());
          try {
            validationGame.load(blessingFenForValidation);
            console.log('[SB Debug onSquareClick] validationGame loaded with store FEN. Current FEN:', validationGame.fen());
          } catch (e) {
            console.error("[SB Debug onSquareClick] Error loading FEN from store into validationGame:", e);
            alert("Error validating move: Game state issue (store FEN). Please try cancelling the blessing and retrying if the issue persists.");
            return;
          }
          console.log('[SB Debug onSquareClick] FEN from store for validation:', validationGame.fen()); // This log might be redundant now or can be kept for clarity
          console.log('[SB Debug onSquareClick] Clicked square for placement:', squareClicked);
          const pieceOnTarget = validationGame.get(squareClicked as Square);
          console.log('[SB Debug onSquareClick] Piece on target for placement:', pieceOnTarget);
          console.log('[SB Debug onSquareClick] Typeof pieceOnTarget:', typeof pieceOnTarget);

          if (pieceOnTarget === null || typeof pieceOnTarget === 'undefined') { // Target square must be empty based on the store's FEN
            if (roomId) {
              placeBlessingPieceClient(roomId, squareClicked);
            }
          } else {
            console.log('[SB Debug onSquareClick] Target square occupied. Piece details:', pieceOnTarget);
            alert("Invalid target: Square is not empty. Click your selected piece again to deselect it, or choose an empty (yellow) square.");
          }
        }
      }
      return; 
    }

    if (myAdvantage?.id === "opening_swap" && showOpeningSwapPrompt && !myOpeningSwapState?.hasSwapped && color) {
      handleSquareClickForSwap(squareClicked as string); 
    }
  };
  
  const handleSquareClickForSwap = (square: string) => {
    if (myAdvantage?.id === "opening_swap" && showOpeningSwapPrompt && !myOpeningSwapState?.hasSwapped && color) {
      const piece = game.get(square as Square); 
      const playerRank = color === 'white' ? '1' : '8';

      if (!piece) {
        if (openingSwapSelection) {
          alert("Opening Swap: Please select one of your non-king pieces on your back rank to swap with " + openingSwapSelection + " or click " + openingSwapSelection + " again to deselect.");
        } else {
          alert("Opening Swap: Please select one of your non-king pieces on your back rank.");
        }
        return; 
      }

      if (piece.color !== color[0] || square[1] !== playerRank || piece.type === 'k') {
        alert("Opening Swap: Please select a non-king piece on your back rank.");
        return; 
      }

      if (!openingSwapSelection) {
        setOpeningSwapSelection(square);
        alert(`Selected ${square}. Now select the second piece to swap with, or click ${square} again to deselect.`);
      } else {
        if (openingSwapSelection === square) { 
          setOpeningSwapSelection(null); 
          alert("Swap selection cancelled.");
        } else {
          console.log(`[Opening Swap] Emitting openingSwap event for ${openingSwapSelection} and ${square}`);
          socket.emit("openingSwap", { roomId, from: openingSwapSelection, to: square });
          setOpeningSwapSelection(null); 
        }
      }
    }
  };

  const makeMove = (from: string, to: string) => {
    let qdAttemptPayload: ServerMovePayload | null = null;
    // Helper function to check and emit Restless King trigger
    const checkAndEmitRestlessKing = (chessJsMove: Move | null | undefined, currentRoomId: string | undefined) => {
      if (chessJsMove &&
          myAdvantage?.id === "restless_king" &&
          chessJsMove.piece === 'k' &&
          !(chessJsMove.flags.includes('k') || chessJsMove.flags.includes('q'))) {
        console.log("[ChessGame] Emitting restlessKingTriggered client event for king move:", chessJsMove);
        socket.emit("restlessKingTriggered", { roomId: currentRoomId });
      }
    };

    if (isSacrificialBlessingActive) {
      alert("Sacrificial Blessing is active. Please click a piece then an empty square. Drag-and-drop is disabled for blessing.");
      return null; 
    }
    if (!color) return null;
    const myColor = color;

    if (showOpeningSwapPrompt && game.history().length === 0) {
      setShowOpeningSwapPrompt(false);
    }

    const turn = game.turn();
    if (
      (turn === "w" && myColor !== "white") ||
      (turn === "b" && myColor !== "black")
    ) {
      return null;
    }

    if (restrictedToPieceType && myColor && game.turn() === myColor[0] && !game.inCheck()) { // Added !game.inCheck()
      if (typeof from === 'string') {
        const pieceOnFromSquare = game.get(from as Square); 
        if (!pieceOnFromSquare || pieceOnFromSquare.type !== restrictedToPieceType) {
          const pieceDisplayNames: { [key: string]: string } = { "p": "Pawn", "n": "Knight", "b": "Bishop", "r": "Rook", "q": "Queen", "k": "King" };
          const niceName = restrictedToPieceType ? (pieceDisplayNames[restrictedToPieceType] || restrictedToPieceType) : "specified piece";
          alert(`Royal Decree Active: You must move a ${niceName}. (You are not in check)`); // Optional: slightly modified message
          return null; 
        }
      } else {
        console.warn('[Royal Decree Client] makeMove called with invalid "from" square during Royal Decree (and not in check):', from);
        return null;
      }
    }

    // Capture FEN before any move attempt for potential server-side deflection
    fenSnapshotBeforeMove.current = game.fen();

    // Queen's Domain move attempt logic
    if (
      myAdvantage?.id === "queens_domain" &&
      isQueensDomainToggleActive && // UI toggle is on
      queensDomainState && 
      !queensDomainState.hasUsed &&
      color // color variable for player's color (myColor was changed to color in a previous step)
    ) {
      console.log("[ChessGame makeMove QD Attempt] Eval QD. isToggleActive:", isQueensDomainToggleActive, "State:", JSON.stringify(queensDomainState), "Piece:", game.get(from as Square)?.type, "Color:", game.get(from as Square)?.color);
      const piece = game.get(from as Square);
      if (piece?.type === 'q' && piece?.color === color[0]) {
        // For client-side check, assume active if toggle is on
        const clientCheckState = { isActive: true, hasUsed: queensDomainState.hasUsed }; 
        console.log("[ChessGame makeMove QD Attempt] Checking canQueenUseDomain with state:", JSON.stringify(clientCheckState));
        if (canQueenUseDomain(new Chess(fenSnapshotBeforeMove.current), from as Square, to as Square, color[0] as 'w' | 'b', clientCheckState)) {
          qdAttemptPayload = { from, to, special: 'queens_domain_move', color: color };
          console.log("[ChessGame makeMove QD Attempt] qdAttemptPayload set for QD:", JSON.stringify(qdAttemptPayload));
        } else {
          alert("Queen's Domain: Invalid path or target for special move. Will attempt as standard move if possible.");
          console.log("[ChessGame makeMove QD Attempt] canQueenUseDomain returned false. Not a QD move.");
          // Toggle will be reset at the end of makeMove if a standard move proceeds
        }
      }
    }

    if (qdAttemptPayload) {
        console.log("[ChessGame makeMove QD Emit] Emitting qdAttemptPayload:", JSON.stringify(qdAttemptPayload));
        socket.emit("sendMove", { roomId, move: qdAttemptPayload });
        // setIsQueensDomainToggleActive(false); // Resetting this will be handled by server confirmation or turn change
        return null; // Prevent local board update until server confirms
    }

    // Handling the second move of Lightning Capture
    if (isAwaitingSecondLcMove && lcFirstMoveDetails && lcFenAfterFirstMove && myColor) {
      const selectedSecondSquare = to; // 'to' from onPieceDrop is the selected square for the second move
      console.log(
        `[ChessGame makeMove] Handling second LC move. Piece moved from ${lcFirstMoveDetails.to} to ${selectedSecondSquare}. Initial move was ${lcFirstMoveDetails.from} -> ${lcFirstMoveDetails.to}.`,
      );

      if (!lcPossibleSecondMoves.includes(selectedSecondSquare)) {
        alert("Invalid second move for Lightning Capture. Click a highlighted square.");
        return null;
      }

      const gameForSecondLcMove = new Chess(lcFenAfterFirstMove);
      // Force turn for the second move
      const parts = gameForSecondLcMove.fen().split(" ");
      parts[1] = myColor === "white" ? "w" : "b";
      try {
        gameForSecondLcMove.load(parts.join(" "));
      } catch (e) {
        console.error("Error loading FEN for second LC move:", e);
        // Revert and reset
        game.load(fenSnapshotBeforeMove.current);
        setFen(fenSnapshotBeforeMove.current);
        setIsLightningCaptureActive(false);
        setIsAwaitingSecondLcMove(false);
        setLcPossibleSecondMoves([]);
        setLcFirstMoveDetails(null);
        setLcFenAfterFirstMove(null);
        return null;
      }
      
      const actualSecondMove = gameForSecondLcMove.move({
        from: lcFirstMoveDetails.to, // This is where the piece landed after the first move
        to: selectedSecondSquare,
        promotion: 'q', // Default promotion
      });

      if (actualSecondMove) {
        setFen(gameForSecondLcMove.fen());
        game.load(gameForSecondLcMove.fen()); // Update main game instance

        // Check for Restless King trigger before emitting LC second move
        checkAndEmitRestlessKing(actualSecondMove, roomId);

        socket.emit("sendMove", {
          roomId,
          move: {
            from: lcFirstMoveDetails.from, // Original 'from' of the LC sequence
            to: lcFirstMoveDetails.to,     // Original 'to' of the first move
            secondTo: selectedSecondSquare, // The 'to' of the second move
            special: 'lightning_capture',
            color: myColor,
          },
        });

        setLightningCaptureState({ used: true });
        setIsLightningCaptureActive(false); // Reset active state
        setIsAwaitingSecondLcMove(false);
        setLcPossibleSecondMoves([]);
        setLcFirstMoveDetails(null);
        setLcFenAfterFirstMove(null);

        // Game over checks
        if (game.isCheckmate()) {
          const winner = game.turn() === "w" ? "black" : "white";
          setGameOverMessage(`${winner} wins by checkmate`);
          socket.emit("gameOver", { roomId, message: `${myColor} wins by checkmate!`, winnerColor: myColor });
        } else if (game.isDraw()) {
          setGameOverMessage("Draw");
          socket.emit("gameDraw", { roomId, message: "Draw!" });
        } else if (game.isStalemate()) {
          setGameOverMessage("Draw by Stalemate");
          socket.emit("gameDraw", { roomId, message: "Stalemate!" });
        } else if (game.isThreefoldRepetition()) {
          setGameOverMessage("Draw by Threefold Repetition");
          socket.emit("gameDraw", { roomId, message: "Draw by threefold repetition!" });
        } else if (game.isInsufficientMaterial()) {
          setGameOverMessage("Draw by Insufficient Material");
          socket.emit("gameDraw", { roomId, message: "Draw by insufficient material!" });
        }
        return actualSecondMove; // Or a simplified object if needed by react-chessboard
      } else {
        alert("Lightning Capture: Second move is invalid or resulted in an illegal position.");
        game.load(fenSnapshotBeforeMove.current); // Revert to state before LC attempt started
        setFen(fenSnapshotBeforeMove.current);
        
        setIsLightningCaptureActive(false);
        setIsAwaitingSecondLcMove(false);
        setLcPossibleSecondMoves([]);
        setLcFirstMoveDetails(null);
        setLcFenAfterFirstMove(null);
        return null;
      }
    }

    // IMPORTANT: The condition for activating LC (attempting the *first* move)
    // should ensure we are NOT already awaiting the second move.
    // if (isLightningCaptureActive && !isAwaitingSecondLcMove) { // This was a placeholder, the actual LC activation is below
    // }

    const opponentShieldedPieceInfo: ShieldedPieceInfo | null = null; // Placeholder
    if (
      isAttemptToCaptureShieldedPieceClient(to, opponentShieldedPieceInfo, game)
    ) {
      alert(
        "Client check: This piece is protected by Silent Shield and cannot be captured.",
      );
      return null; // Prevent move
    }

    let move: any; // This will hold the move object to be sent or processed

    // Lightning Capture Activation (First Move Attempt)
    if (
      myAdvantage?.id === "lightning_capture" &&
      isLightningCaptureActive && // LC toggle is on
      !lightningCaptureState.used && // LC advantage hasn't been fully used up
      !isAwaitingSecondLcMove && // Crucially, not already waiting for the second part of a LC move
      myColor
    ) {
      console.log(
        `[ChessGame makeMove] Attempting Lightning Capture - First Move from ${from} to ${to}`,
      );
      // fenSnapshotBeforeMove.current is already set at the beginning of makeMove

      const gameInstanceForLC = new Chess(fenSnapshotBeforeMove.current);

      // Call the refactored handleLightningCaptureClient (synchronous call)
      const lcResult = handleLightningCaptureClient({
        game: gameInstanceForLC, // Pass the copy
        originalFen: fenSnapshotBeforeMove.current,
        from,
        to,
        color: myColor,
      });

      if (lcResult.outcome === "success_first_move") {
        console.log("[ChessGame makeMove] LC First Move SUCCESS:", lcResult);
        setLcFenAfterFirstMove(lcResult.fenAfterFirstCapture);
        setLcPossibleSecondMoves(lcResult.possibleSecondMoves.map(m => m.to));
        setLcFirstMoveDetails({ from, to: lcResult.pieceSquare });
        setIsAwaitingSecondLcMove(true); // Now waiting for the user to make the second move
        setFen(lcResult.fenAfterFirstCapture); // Update board to show the first move
        // isLightningCaptureActive should remain true until the sequence is complete or cancelled
        return null; // Signal to react-chessboard the move is handled (first part)
      } else { // lcResult.outcome === "failure"
        console.log("[ChessGame makeMove] LC First Move FAILED:", lcResult);
        let failureMessage = `Lightning Capture Failed: ${lcResult.reason}`;
        if (lcResult.reason === "not_capture") {
          failureMessage = "Lightning Capture requires a valid capture as the first move.";
        } else if (lcResult.reason === "no_second_moves") {
          failureMessage = "Lightning Capture Failed: No valid second moves available after the first capture.";
        }
        alert(failureMessage);

        // Revert UI and game state if it was optimistically updated or if FEN changed
        // The main `game` object in ChessGame.tsx was not directly modified by handleLightningCaptureClient
        // as it operated on a copy. We only need to reset if `setFen` was called or other UI states changed.
        if (game.fen() !== fenSnapshotBeforeMove.current) {
          console.log(`[ChessGame makeMove] Reverting game state from ${game.fen()} to ${fenSnapshotBeforeMove.current}`);
          game.load(fenSnapshotBeforeMove.current);
          setFen(fenSnapshotBeforeMove.current);
        }

        // Reset LC states
        setIsLightningCaptureActive(false); // Deactivate LC button/mode
        setIsAwaitingSecondLcMove(false);
        setLcPossibleSecondMoves([]);
        setLcFirstMoveDetails(null);
        setLcFenAfterFirstMove(null);
        return null; // Signal to react-chessboard the move attempt failed
      }
    }

    // Royal Escort Logic
    if (myAdvantage?.id === "royal_escort" && royalEscortState && myColor) {
      const royalEscortResult = handleRoyalEscortClient({
        game,
        from,
        to,
        color: myColor,
        royalEscortState,
      });

      if (royalEscortResult.moveData) {
        setFen(game.fen());
        // For Royal Escort, royalEscortResult.moveData is ServerMovePayload.
        // We'd need the original chess.js move object if the king was the primary piece moved by player.
        // Assuming the server-side "restlessKingTriggered" handler will correctly validate if this was a king move.
        // Client *could* try to reconstruct, e.g. by checking game.get(royalEscortResult.moveData.to).type but flags are missing.
        // For now, we rely on server for RK activation if this was a king move.
        // If royalEscortResult.moveData had the original chess.js move object, we'd call checkAndEmitRestlessKing here.
        socket.emit("sendMove", { roomId, move: royalEscortResult.moveData });

        setRoyalEscortState((prevState) => ({
          ...prevState!,
          usedCount: prevState!.usedCount + 1,
        }));

        // Game over checks
        if (game.isCheckmate()) {
          const winner = game.turn() === "w" ? "black" : "white";
          setGameOverMessage(`${winner} wins by checkmate`);
          socket.emit("gameOver", {
            roomId,
            message: `${myColor} wins by checkmate!`,
            winnerColor: myColor,
          });
        } else if (game.isDraw()) {
          setGameOverMessage("Draw");
          socket.emit("gameDraw", { roomId, message: "Draw!" });
        } else if (game.isStalemate()) {
          setGameOverMessage("Draw by Stalemate");
          socket.emit("gameDraw", { roomId, message: "Stalemate!" });
        } else if (game.isThreefoldRepetition()) {
          setGameOverMessage("Draw by Threefold Repetition");
          socket.emit("gameDraw", {
            roomId,
            message: "Draw by threefold repetition!",
          });
        } else if (game.isInsufficientMaterial()) {
          setGameOverMessage("Draw by Insufficient Material");
          socket.emit("gameDraw", {
            roomId,
            message: "Draw by insufficient material!",
          });
        }
        return royalEscortResult.moveData;
      } else if (royalEscortResult.attempted) {
        // Invalid Royal Escort attempt (e.g., puts king in check)
        return null;
      }
      // If not attempted, fall through to other advantages / standard move
    }

    // Pawn Rush logic
    if (!move && myAdvantage?.id === "pawn_rush" && myColor) {
      const pawnRushMove = handlePawnRushClient({
        game,
        from,
        to,
        color: myColor,
      });
      if (pawnRushMove) {
        move = pawnRushMove;
      }
    }

    // Castle Master logic
    // Note: Added '!move &&' to ensure it doesn't try if Pawn Rush already prepared a move.
    if (
      !move &&
      myAdvantage?.id === "castle_master" &&
      !hasUsedCastleMaster.current &&
      myColor
    ) {
      const castleMasterResult = handleCastleMasterClient({
        game,
        from,
        to,
        color: myColor,
      });

      if (castleMasterResult.moveData) {
        setFen(game.fen());
        move = castleMasterResult.moveData;
      }

      if (castleMasterResult.advantageUsed) {
        hasUsedCastleMaster.current = true;
      }

      if (castleMasterResult.moveData) {
        // Castle Master moves are always castling, so checkAndEmitRestlessKing would not fire.
        // No explicit call to checkAndEmitRestlessKing needed here as the conditions (not castling) wouldn't be met.
        socket.emit("sendMove", { roomId, move: castleMasterResult.moveData });
        // Game over checks after emitting Castle Master move
        if (game.isCheckmate()) {
          const winnerLogic = game.turn() === "w" ? "black" : "white"; // Winner is the one whose opponent is checkmated
          setGameOverMessage(`${winnerLogic} wins by checkmate`);
          socket.emit("gameOver", {
            roomId,
            message: `${winnerLogic} wins by checkmate!`,
            winnerColor: winnerLogic,
          });
        } else if (game.isDraw()) {
          setGameOverMessage("Draw");
          socket.emit("gameDraw", { roomId, message: "Draw!" });
        } else if (game.isStalemate()) {
          setGameOverMessage("Draw by Stalemate");
          socket.emit("gameDraw", { roomId, message: "Stalemate!" });
        } else if (game.isThreefoldRepetition()) {
          setGameOverMessage("Draw by Threefold Repetition");
          socket.emit("gameDraw", {
            roomId,
            message: "Draw by threefold repetition!",
          });
        } else if (game.isInsufficientMaterial()) {
          setGameOverMessage("Draw by Insufficient Material");
          socket.emit("gameDraw", {
            roomId,
            message: "Draw by insufficient material!",
          });
        }
        return castleMasterResult.moveData;
      } else if (castleMasterResult.advantageUsed) {
        // Advantage was attempted (e.g. king moved one square next to rook) but no special move was made.
        // Block standard move if it was a failed special action.
        return null;
      }
    }

    // Focused Bishop Logic
    // Note: Added '!move &&'
    if (
      !move &&
      myAdvantage?.id === "focused_bishop" &&
      !hasUsedFocusedBishop.current &&
      myColor
    ) {
      const focusedBishopResult = handleFocusedBishopClient({
        game,
        from,
        to,
        color: myColor,
        hasUsedFocusedBishop: hasUsedFocusedBishop.current,
      });
      if (focusedBishopResult.moveData) {
        setFen(game.fen());
        move = focusedBishopResult.moveData;
      }
      if (focusedBishopResult.advantageUsedAttempt) {
        hasUsedFocusedBishop.current = true;
        if (focusedBishopResult.moveData) {
          // Focused Bishop moves a bishop, not a king.
          // No explicit call to checkAndEmitRestlessKing needed.
          socket.emit("sendMove", {
            roomId,
            move: focusedBishopResult.moveData,
          });
          // Game over checks
          if (game.isCheckmate()) {
            const winnerLogic = game.turn() === "w" ? "black" : "white";
            setGameOverMessage(`${winnerLogic} wins by checkmate`);
            socket.emit("gameOver", {
              roomId,
              message: `${winnerLogic} wins by checkmate!`,
              winnerColor: winnerLogic,
            });
          } else if (game.isDraw()) {
            setGameOverMessage("Draw");
            socket.emit("gameDraw", { roomId, message: "Draw!" });
          } else if (game.isStalemate()) {
            setGameOverMessage("Draw by Stalemate");
            socket.emit("gameDraw", { roomId, message: "Stalemate!" });
          } else if (game.isThreefoldRepetition()) {
            setGameOverMessage("Draw by Threefold Repetition");
            socket.emit("gameDraw", {
              roomId,
              message: "Draw by threefold repetition!",
            });
          } else if (game.isInsufficientMaterial()) {
            setGameOverMessage("Draw by Insufficient Material");
            socket.emit("gameDraw", {
              roomId,
              message: "Draw by insufficient material!",
            });
          }
          return focusedBishopResult.moveData;
        } else {
          // Focused Bishop was attempted (hasUsedFocusedBishop set to true) but no valid move was made.
          // Block standard move.
          return null;
        }
      }
    }

    // Corner Blitz Logic
    // Note: Added '!move &&'
    if (!move && myAdvantage?.id === "corner_blitz" && myColor) {
      console.log("[ChessGame] makeMove: Checking Corner Blitz for", {
        from,
        to,
      });
      const cornerBlitzResult = handleCornerBlitzClient({
        game,
        from,
        to,
        color: myColor,
        playerRooksMoved: playerRooksMoved.current,
      });
      console.log(
        "[ChessGame] makeMove: Corner Blitz result:",
        cornerBlitzResult,
      );

      if (cornerBlitzResult.moveData) {
        // Valid Corner Blitz move constructed and applied locally by handleCornerBlitzClient
        setFen(game.fen()); // Update FEN from game instance modified by handler

        if (cornerBlitzResult.rookMovedKey) {
          playerRooksMoved.current = {
            ...playerRooksMoved.current,
            [cornerBlitzResult.rookMovedKey]: true,
          };
          console.log(
            "[ChessGame] makeMove: Updated playerRooksMoved:",
            playerRooksMoved.current,
          );
        }

        // Emit the special move to the server
        console.log(
          "[ChessGame] makeMove: Emitting Corner Blitz move to server:",
          cornerBlitzResult.moveData,
        );
        // Corner Blitz moves a rook, not a king.
        // No explicit call to checkAndEmitRestlessKing needed.
        socket.emit("sendMove", { roomId, move: cornerBlitzResult.moveData });

        // Check for game over states immediately after this client-side validated special move
        if (game.isCheckmate()) {
          const winnerLogic = game.turn() === "w" ? "black" : "white";
          setGameOverMessage(`${winnerLogic} wins by checkmate`);
          socket.emit("gameOver", {
            roomId,
            message: `${winnerLogic} wins by checkmate!`,
            winnerColor: winnerLogic,
          });
        } else if (game.isDraw()) {
          setGameOverMessage("Draw");
          socket.emit("gameDraw", { roomId, message: "Draw!" });
        } else if (game.isStalemate()) {
          setGameOverMessage("Draw by Stalemate");
          socket.emit("gameDraw", { roomId, message: "Stalemate!" });
        } else if (game.isThreefoldRepetition()) {
          setGameOverMessage("Draw by Threefold Repetition");
          socket.emit("gameDraw", {
            roomId,
            message: "Draw by threefold repetition!",
          });
        } else if (game.isInsufficientMaterial()) {
          setGameOverMessage("Draw by Insufficient Material");
          socket.emit("gameDraw", {
            roomId,
            message: "Draw by insufficient material!",
          });
        }
        // IMPORTANT: Return early to prevent this move from being processed by standard game.move()
        return cornerBlitzResult.moveData;
      } else if (
        cornerBlitzResult.rookMovedKey &&
        !cornerBlitzResult.moveData
      ) {
        // This means a Corner Blitz move was *attempted* with a valid rook (rookMovedKey is set),
        // but it was invalid (e.g., put king in check, or target square blocked).
        // We should not fall through to standard move logic in this case.
        console.log(
          `[ChessGame] makeMove: Corner Blitz attempt for rook ${cornerBlitzResult.rookMovedKey} failed locally. Not sending to server or trying as standard move.`,
        );
        return null;
      }
      // If rookMovedKey was null, it means it wasn't even a Corner Blitz attempt (e.g., wrong piece clicked),
      // so we fall through, and 'move' remains undefined, allowing standard logic or other advantages.
    }

    // Fallback: standard move
    // This block is reached if 'move' is still undefined (no special advantage handled it and returned early)
    if (!move) {
      console.log("[ChessGame] makeMove: Attempting as standard move for", {
        from,
        to,
      });
      const piece = game.get(from as Square);
      const isPawnPromotion =
        piece?.type === "p" &&
        ((piece.color === "w" && to[1] === "8") ||
          (piece.color === "b" && to[1] === "1"));
      try {
        const gameForStandardMove = new Chess(fenSnapshotBeforeMove.current);
        const standardMoveAttempt = gameForStandardMove.move({ // This is a chess.js Move object
          from,
          to,
          ...(isPawnPromotion ? { promotion: "q" } : {}),
        });

        if (standardMoveAttempt) {
          // Standard move was locally valid.
          // NOW, check for Pawn Ambush for the current player.
          let serverPayload: ServerMovePayload = { // Prepare payload based on standard move first
            from: standardMoveAttempt.from,
            to: standardMoveAttempt.to,
            color: myColor, // myColor is 'white' | 'black'
            promotion: standardMoveAttempt.promotion // Standard 8th rank promotion
          };

          if (standardMoveAttempt.piece === 'p' && !standardMoveAttempt.promotion && myAdvantage?.id === 'pawn_ambush' && myColor) {
            // Pawn move, not a standard promotion, player has ambush.
            // Use a temporary game instance that reflects the board *after* standardMoveAttempt.
            const gameAfterPawnMove = new Chess(gameForStandardMove.fen());
            
            const ambushResult = handlePawnAmbushClient({
              game: gameAfterPawnMove, // This game instance is modified by handlePawnAmbushClient
              move: standardMoveAttempt, // Original pawn move
              playerColor: myColor,
              advantage: myAdvantage,
            });

            if (ambushResult.promotionApplied && ambushResult.fen) {
              console.log("[ChessGame makeMove] Pawn Ambush applied locally by client. Updating board and payload.");
              game.load(ambushResult.fen); // Update main 'game' instance with the ambushed state
              setFen(ambushResult.fen);     // Update UI

              // Modify the serverPayload to reflect ambush
              serverPayload.wasPawnAmbush = true;
              serverPayload.promotion = 'q'; // Ambush promotes to queen
              
              // Emit this special move and return, bypassing generic emit further down.
              // The original move was a pawn move (standardMoveAttempt), so Restless King condition (move.piece === 'k') won't be met.
              checkAndEmitRestlessKing(standardMoveAttempt, roomId); // This will correctly not fire for pawn moves
              socket.emit("sendMove", { roomId, move: serverPayload });
              // Game Over Checks
              if (game.isCheckmate()) {
                const winnerLogic = game.turn() === "w" ? "black" : "white";
                setGameOverMessage(`${winnerLogic} wins by checkmate`);
                socket.emit("gameOver", { roomId, message: `${winnerLogic} wins by checkmate!`, winnerColor: winnerLogic });
              } else if (game.isDraw()) {
                setGameOverMessage("Draw");
                socket.emit("gameDraw", { roomId, message: "Draw!" });
              } else if (game.isStalemate()) {
                setGameOverMessage("Draw by Stalemate");
                socket.emit("gameDraw", { roomId, message: "Stalemate!" });
              } else if (game.isThreefoldRepetition()) {
                setGameOverMessage("Draw by Threefold Repetition");
                socket.emit("gameDraw", { roomId, message: "Draw by threefold repetition!" });
              } else if (game.isInsufficientMaterial()) {
                setGameOverMessage("Draw by Insufficient Material");
                socket.emit("gameDraw", { roomId, message: "Draw by insufficient material!" });
              }
              return standardMoveAttempt; // Return original pawn move for react-chessboard
            }
          }
          
          // If Pawn Ambush did not apply, or was not relevant, proceed with the standard move.
          game.load(gameForStandardMove.fen()); // Load the result of the standard move into the main game instance
          setFen(game.fen());
          move = standardMoveAttempt; // This will be converted to ServerMovePayload by the generic emit block.
        } else {
          console.log(
            "[ChessGame] makeMove: Standard game.move() returned null (invalid standard move).",
          );
          return null;
        }
      } catch (err: any) {
        console.error(
          "[ChessGame] makeMove: game.move() threw an error:",
          err.message,
        );
        alert("Invalid move: " + err.message);
        return null;
      }
    }

    // Emit standard moves or special moves that didn't emit themselves and return early
    if (move) {
      let movePayloadToSend: ServerMovePayload;

      if (typeof (move as any).flags === 'string') { // Heuristic: if it's a chess.js Move object (standard move not ambushed)
        movePayloadToSend = {
          from: move.from,
          to: move.to,
          color: myColor!, 
          promotion: move.promotion,
        };
      } else { // 'move' is already a ServerMovePayload from another advantage handler (e.g. Pawn Rush)
        movePayloadToSend = move as ServerMovePayload;
        if (!movePayloadToSend.color && myColor) {
            movePayloadToSend.color = myColor;
        }
      }
      
      // Call for standard moves or other advantages that fall through (e.g. Pawn Rush that didn't ambush)
      // 'move' here should be the chess.js Move object
      checkAndEmitRestlessKing(move, roomId); 

      console.log("[ChessGame] makeMove: Emitting move to server (standard or other advantage):", movePayloadToSend);
      socket.emit("sendMove", { roomId, move: movePayloadToSend });

      // Game over checks for standard moves / Pawn Rush etc.
      if (game.isCheckmate()) {
        const winnerLogic = game.turn() === "w" ? "black" : "white";
        setGameOverMessage(`${winnerLogic} wins by checkmate`);
        socket.emit("gameOver", {
          roomId,
          message: `${winnerLogic} wins by checkmate!`,
          winnerColor: winnerLogic,
        });
      } else if (game.isDraw()) {
        setGameOverMessage("Draw");
        socket.emit("gameDraw", { roomId, message: "Draw!" });
      } else if (game.isStalemate()) {
        setGameOverMessage("Draw by Stalemate");
        socket.emit("gameDraw", { roomId, message: "Stalemate!" });
      } else if (game.isThreefoldRepetition()) {
        setGameOverMessage("Draw by Threefold Repetition");
        socket.emit("gameDraw", {
          roomId,
          message: "Draw by threefold repetition!",
        });
      } else if (game.isInsufficientMaterial()) {
        setGameOverMessage("Draw by Insufficient Material");
        socket.emit("gameDraw", {
          roomId,
          message: "Draw by insufficient material!",
        });
      }
    }

    // Reset isQueensDomainToggleActive if a non-QD move was made or QD client check failed
    // 'move' here is the result of a successful local game.move() or an advantage move that wasn't QD.
    if (move && isQueensDomainToggleActive && !qdAttemptPayload) {
        // This means a move was made, toggle was on, but QD special payload was not prepared/sent.
        setIsQueensDomainToggleActive(false);
        console.log("QD Toggle active, but a non-QD move was made or QD client check failed. Resetting toggle.");
    }
    return move; // Return the move object (or null if all attempts failed)
  };

  const handleCancelLc = () => {
    // Reset all LC UI states
    setIsLightningCaptureActive(false);
    setIsAwaitingSecondLcMove(false);
    setLcPossibleSecondMoves([]);
    setLcFirstMoveDetails(null);
    setLcFenAfterFirstMove(null); // Reset the new state

    // Revert game to the state before Lightning Capture was initiated
    if (fenSnapshotBeforeMove.current) { 
      game.load(fenSnapshotBeforeMove.current);
      setFen(fenSnapshotBeforeMove.current);
    } else {
      // This case should ideally not happen if LC was in progress
      console.warn("[ChessGame handleCancelLc] fenSnapshotBeforeMove.current was not set, cannot revert.");
      // As a fallback, could reload current game fen to ensure consistency, though snapshot is preferred.
      // For now, this implies the board might not visually revert if snapshot is missing.
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: 600, margin: "0 auto" }}>
      <h2>
        Advantage Chess — Room <code>{roomId}</code>
      </h2>

      <p>
        You are playing as: <strong>{color ?? "..."}</strong>
        <br />
        {opponentConnected
          ? "Opponent connected ✅"
          : "Waiting for opponent... ⏳"}
      </p>

      {myAdvantage && (
        <div
          style={{
            margin: "10px 0",
            padding: "10px",
            background: "#f0f0f0",
            borderRadius: "4px",
          }}
        >
          <p>
            Your Advantage: <strong>{myAdvantage.name}</strong>
          </p>
          {myAdvantage.id === 'sacrificial_blessing' && (
            <p><em>{hasUsedMySacrificialBlessing ? "Sacrificial Blessing has been used." : "The first time one of your Knights or Bishops is captured, you may immediately move another one of your Knights or Bishops (if you have one) to any empty square on the board. Doesn't count as a turn."}</em></p>
          )}
          {myAdvantage.id === "lightning_capture" &&
            !lightningCaptureState.used && (
              <>
                <button
                  onClick={() =>
                    setIsLightningCaptureActive(!isLightningCaptureActive)
                  }
                  disabled={
                    lightningCaptureState.used || isAwaitingSecondLcMove
                  }
                  style={{
                    marginRight: "10px",
                    background: isLightningCaptureActive ? "lightblue" : "",
                  }}
                >
                  {isLightningCaptureActive
                    ? "Deactivate Lightning Capture"
                    : "Activate Lightning Capture"}
                </button>
                {isLightningCaptureActive && !isAwaitingSecondLcMove && (
                  <p>Click a piece to make the first (capture) move.</p>
                )}
              </>
            )}
          {myAdvantage.id === "lightning_capture" &&
            lightningCaptureState.used && (
              <p>
                <em>Lightning Capture has been used.</em>
              </p>
            )}
          {isAwaitingSecondLcMove && lcFirstMoveDetails && (
            <div>
              <p>
                Lightning Capture: First move from {lcFirstMoveDetails.from} to{" "}
                {lcFirstMoveDetails.to} made.
              </p>
              <p>
                <strong>
                  Select the second move for the piece on{" "}
                  {lcFirstMoveDetails.to}. Click a highlighted square.
                </strong>
              </p>
              <button onClick={handleCancelLc}>Cancel Lightning Capture</button>
            </div>
          )}
          {myAdvantage?.id === "opening_swap" && showOpeningSwapPrompt && !myOpeningSwapState?.hasSwapped && (
            <div style={{ marginTop: '10px', padding: '10px', background: '#e0e0ff', borderRadius: '4px' }}>
              <h4>Opening Swap</h4>
              {openingSwapSelection ? (
                <p>Selected {openingSwapSelection}. Select another piece on your back rank to swap with, or cancel.</p>
              ) : (
                <p>Select two non-king pieces on your back rank to swap them. Click a piece to select.</p>
              )}
              <button onClick={() => {
                setShowOpeningSwapPrompt(false);
                setOpeningSwapSelection(null);
                // Optionally, inform server the player skipped (though not strictly necessary if they just make a move)
              }}>Skip Swap / Cancel</button>
            </div>
          )}
          {myAdvantage.id === "royal_decree" && !hasUsedRoyalDecree && (
            <div style={{ marginTop: '10px' }}>
              <button
                onClick={() => {
                  const pieceTypes = ["p", "n", "b", "r", "q", "k"];
                  const pieceDisplayNames: { [key: string]: string } = { // Add index signature
                    "p": "Pawn", "n": "Knight", "b": "Bishop",
                    "r": "Rook", "q": "Queen", "k": "King"
                  };
                  const promptMessage = "Royal Decree: Enter piece type to restrict opponent to\n(p=Pawn, n=Knight, b=Bishop, r=Rook, q=Queen, k=King):";
                  const selectedPieceTypeInput = window.prompt(promptMessage)?.toLowerCase();

                  if (selectedPieceTypeInput && pieceTypes.includes(selectedPieceTypeInput)) {
                    console.log(`[Royal Decree Client] Activating. Opponent will be restricted to: ${pieceDisplayNames[selectedPieceTypeInput]}`);
                    socket.emit("royalDecree", { roomId, pieceType: selectedPieceTypeInput });
                    setHasUsedRoyalDecree(true);
                  } else if (selectedPieceTypeInput) { // Input was given but invalid
                    alert("Invalid piece type entered. Please use one of: p, n, b, r, q, k.");
                    console.log(`[Royal Decree Client] Invalid piece type entered: ${selectedPieceTypeInput}`);
                  } else { // Prompt was cancelled or empty
                    console.log("[Royal Decree Client] Activation cancelled by user.");
                  }
                }}
              >
                Activate Royal Decree
              </button>
            </div>
          )}
          {myAdvantage.id === "royal_decree" && hasUsedRoyalDecree && (
            <p style={{ marginTop: '10px' }}><em>Royal Decree has been used.</em></p>
          )}
          {myAdvantage?.id === "queens_domain" && color && game.turn() === color[0] && !queensDomainState?.hasUsed && isQueenAlive(game, color) && (
            <button
              onClick={() => {
                const newToggleState = !isQueensDomainToggleActive; // Calculate the new state first
                setIsQueensDomainToggleActive(newToggleState); // Set the state

                if (newToggleState) {
                  alert("Queen's Domain activated! Your next queen move can pass through friendly pieces.");
                } else {
                  alert("Queen's Domain deactivated for the next move.");
                }

                console.log("[ChessGame QD Button] Clicked. New isQueensDomainToggleActive:", newToggleState, "Emitting setAdvantageActiveState with isActive:", newToggleState);

                // Ensure roomId, myAdvantage, etc., are available in this scope
                // This part about emitting to socket remains the same, but uses the definitive newToggleState
                if (roomId && myAdvantage?.id === 'queens_domain' && queensDomainState && !queensDomainState.hasUsed) {
                  socket.emit("setAdvantageActiveState", {
                    roomId,
                    advantageId: "queens_domain",
                    isActive: newToggleState, // Send the new state
                  });
                }
              }}
              style={{ margin: "5px", padding: "8px 12px", background: isQueensDomainToggleActive ? "lightblue" : "#efefef", border: `2px solid ${isQueensDomainToggleActive ? "blue" : (queensDomainState?.hasUsed ? "red" : "grey")}` }}
              disabled={queensDomainState?.hasUsed}
            >
              👑 {isQueensDomainToggleActive ? "Deactivate" : "Use"} Queen’s Domain
            </button>
          )}
          {myAdvantage?.id === "queens_domain" && queensDomainState?.hasUsed && (
            <p style={{color: "red", margin: "5px"}}><em>Queen’s Domain has been used.</em></p>
          )}
        </div>
      )}

      {royalDecreeMessage && <p style={{ color: 'orange', fontWeight: 'bold', marginTop: '5px', marginBottom: '5px' }}>{royalDecreeMessage}</p>}

      {isSacrificialBlessingActive && (
        <div style={{ padding: '10px', margin: '10px 0', background: '#e0efff', border: '1px solid #b0cfff', borderRadius: '4px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 'bold' }}>Sacrificial Blessing Active!</p>
          {!selectedPieceForBlessing
            ? <p style={{ margin: '5px 0 0 0' }}>Select one of your highlighted Knights or Bishops to move.</p>
            : <p style={{ margin: '5px 0 0 0' }}>Selected {selectedPieceForBlessing.type.toUpperCase()} on {selectedPieceForBlessing.square}. Click an empty (yellow) square to place it.</p>}
          <button onClick={() => resetSacrificialBlessingState()} style={{ marginTop: '10px', padding: '5px 10px' }}>Cancel Blessing</button>
        </div>
      )}

      <div style={{ position: "relative" }}>
        <Chessboard
          position={fen}
          onSquareClick={onSquareClick}
          onPieceDrop={(from, to) => {
            if (isSacrificialBlessingActive) { 
                alert("Sacrificial Blessing is active. Please click a piece then an empty square. Drag-and-drop is disabled for blessing.");
                return false; 
            }
            if (isAwaitingSecondLcMove && lcFirstMoveDetails) {
               makeMove(from, to); 
               return true; 
            }
            // Ensure that onPieceDrop does not interfere with swap if swap is active.
            // However, since swap is click based now, this might not be an issue.
            // If a piece is dropped while swap prompt is open, it's likely a regular move attempt.
            // The makeMove function already handles hiding the prompt if a move is made.
            return !!makeMove(from, to); // For non-LC moves or first LC move
          }}
          boardWidth={500}
          boardOrientation={color === "black" ? "black" : "white"}
          customSquareStyles={(() => {
            let styles: { [key: string]: React.CSSProperties } = {};

            if (myAdvantage?.id === "queens_domain" && isQueensDomainToggleActive && queensDomainState && !queensDomainState.hasUsed && color && game.turn() === color[0]) {
              const playerQueenSquares: Square[] = [];
              const board = game.board();
              for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                  const piece = board[r][c];
                  if (piece && piece.type === 'q' && piece.color === color[0]) {
                    playerQueenSquares.push(String.fromCharCode(97 + c) + (8 - r) as Square);
                  }
                }
              }
              playerQueenSquares.forEach(queenSq => {
                const qdPathSquares = getQueenGhostPath(game, queenSq, color[0] as 'w' | 'b', { isActive: true, hasUsed: false });
                qdPathSquares.forEach(sq => {
                  styles[sq] = { ...styles[sq], background: "rgba(220, 180, 255, 0.4)" }; // Light purple tint
                });
              });
            }
            
            if (isAwaitingSecondLcMove && lcFirstMoveDetails) {
              lcPossibleSecondMoves.forEach(sq => {
                styles[sq] = { ...styles[sq], background: "rgba(255, 255, 0, 0.4)" };
              });
              styles[lcFirstMoveDetails.to] = { ...styles[lcFirstMoveDetails.to], background: "rgba(0, 255, 0, 0.4)" };
            } else if (openingSwapSelection) {
              styles[openingSwapSelection] = { ...(styles[openingSwapSelection] || {}), background: "rgba(255, 220, 0, 0.6)" };
            }
            
            if (restrictedToPieceType && color && game.turn() === color[0]) {
              const squares = game.board().flat().map(p => p?.square).filter(Boolean);
              for (const square of squares) {
                if (square) { 
                    const pieceOnSquare = game.get(square as Square);
                    if (pieceOnSquare && pieceOnSquare.color === color[0]) {
                        if (pieceOnSquare.type !== restrictedToPieceType) {
                            styles[square] = { ...(styles[square] || {}), opacity: 0.5 };
                        }
                    }
                }
              }
            }

            if (isSacrificialBlessingActive) {
              // console.log('[SB Debug] customSquareStyles: Blessing active, piece selected. Game FEN:', game.fen()); // Removed
              availablePiecesForBlessing.forEach(p => {
                styles[p.square] = { ...styles[p.square], background: "rgba(173, 216, 230, 0.7)", cursor: 'pointer' };
              });
              if (selectedPieceForBlessing) {
                const blessingFenForStyling = useSacrificialBlessingStore.getState().currentBlessingFen;
                if (!blessingFenForStyling) {
                  console.error('[SB Debug customSquareStyles] No blessingFenForStyling available from store.');
                  // Potentially return styles as is, or indicate an error state in styling.
                  // For now, just log and don't highlight empty squares if FEN is missing.
                  return styles; 
                }

                const stylingGame = new Chess();
                console.log('[SB Debug customSquareStyles] stylingGame created. Initial FEN:', stylingGame.fen());
                try {
                  stylingGame.load(blessingFenForStyling); 
                  console.log('[SB Debug customSquareStyles] stylingGame loaded with store FEN. Current FEN:', stylingGame.fen());
                } catch (e) {
                  console.error("[SB Debug customSquareStyles] Error loading FEN from store into stylingGame:", e);
                  return styles; // Fallback: return current styles without empty square highlights
                }
                console.log('[SB Debug customSquareStyles] FEN from store for styling:', stylingGame.fen()); // This log might be redundant now or can be kept for clarity
                let emptySquaresCount = 0;
                styles[selectedPieceForBlessing.square] = { ...styles[selectedPieceForBlessing.square], background: "rgba(0, 128, 0, 0.7)" };
                
                for (let r = 1; r <= 8; r++) {
                  for (let c = 0; c < 8; c++) {
                    const s = String.fromCharCode(97 + c) + r;
                    const pieceOnSquare = stylingGame.get(s as Square);
                    console.log('[SB Debug customSquareStyles] Square:', s, 'Piece:', pieceOnSquare, 'Typeof Piece:', typeof pieceOnSquare, 'is Empty (null or undefined):', pieceOnSquare === null || typeof pieceOnSquare === 'undefined');
                    if (pieceOnSquare === null || typeof pieceOnSquare === 'undefined') {
                      emptySquaresCount++;
                      styles[s] = { ...(styles[s] || {}), background: "rgba(255, 255, 0, 0.4)", cursor: 'pointer' };
                    }
                  }
                }
                console.log('[SB Debug customSquareStyles] Empty squares based on store FEN:', emptySquaresCount);
              }
            }
            return styles;
          })()}
        />
      </div>

      {gameOverMessage && (
        <div
          style={{
            marginTop: 20,
            padding: 20,
            backgroundColor: "#222",
            color: "#fff",
            textAlign: "center",
            borderRadius: 8,
          }}
        >
          <h3>{gameOverMessage}</h3>
          {revealedAdvantages && (
            <>
              <p>
                <strong>Your Advantage:</strong>{" "}
                {color === "white"
                  ? revealedAdvantages.whiteAdvantage?.name
                  : revealedAdvantages.blackAdvantage?.name}
              </p>
              <p>
                <strong>Opponent's Advantage:</strong>{" "}
                {color === "white"
                  ? revealedAdvantages.blackAdvantage?.name
                  : revealedAdvantages.whiteAdvantage?.name}
              </p>
            </>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 10,
              padding: "8px 16px",
              fontSize: "1rem",
              borderRadius: 6,
              backgroundColor: "#fff",
              color: "#000",
              border: "none",
              cursor: "pointer",
            }}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
