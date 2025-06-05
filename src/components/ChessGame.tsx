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
import {
  canKnightUseKnightmare,
  getKnightmareSquares,
  handleKnightmareClientMove,
} from "../logic/advantages/knightmare";
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
const [knightmareState, setKnightmareState] = useState<{ hasUsed: boolean } | null>(null); // Knightmare state
const [knightmareActiveKnight, setKnightmareActiveKnight] = useState<Square | null>(null);
const [knightmarePossibleMoves, setKnightmarePossibleMoves] = useState<Square[]>([]);

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

  if (myAdvantage?.id === "knightmare") {
    // Initialize the core Knightmare state if it's not already set (e.g., advantage just switched to Knightmare)
    if (!knightmareState) { // Check if knightmareState itself is null
        setKnightmareState({ hasUsed: false });
        console.log('[KM DEBUG ChessGame] useEffect: Knightmare newly active. Initializing knightmareState to { hasUsed: false }.');
        // DO NOT reset knightmareActiveKnight or knightmarePossibleMoves here.
        // They should only be reset if the advantage changes AWAY from knightmare,
        // or by other specific UI interactions (like making a move or deselecting).
    } else {
        console.log('[KM DEBUG ChessGame] useEffect: Knightmare remains active. Current state:', knightmareState);
    }
  } else {
      // Knightmare is NOT the current advantage. Clear all its related states.
      if (knightmareState !== null) { // Only update if there's a change to make
        console.log('[KM DEBUG ChessGame] useEffect: Knightmare no longer active. Resetting knightmareState.');
        setKnightmareState(null);
      }
      if (knightmareActiveKnight !== null) {
        console.log('[KM DEBUG ChessGame] useEffect: Knightmare no longer active. Resetting knightmareActiveKnight.');
        setKnightmareActiveKnight(null);
      }
      if (knightmarePossibleMoves.length > 0) {
        console.log('[KM DEBUG ChessGame] useEffect: Knightmare no longer active. Resetting knightmarePossibleMoves.');
        setKnightmarePossibleMoves([]);
      }
  }
  }, [myAdvantage]); // Simplified dependencies, check if knightmareState itself is needed if its internal changes shouldn't re-run this specific block

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
    
    type ReceiveMoveEventData = {
      move: ServerMovePayload; 
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

      if (isAwaitingSecondLcMove) {
        console.warn(
          "[ChessGame handleReceiveMove] Ignoring opponent move while awaiting second LC move.",
        );
        return;
      }

      const isEcho = receivedMove.color === color;

      if (isEcho && receivedMove.color === color) { 
        console.log("[ChessGame handleReceiveMove ECHO] Received echo:", JSON.stringify(receivedMove));

        let boardUpdatedByEcho = false;
        if (receivedMove.afterFen) {
            console.log("[ChessGame handleReceiveMove ECHO] Loading FEN from server via receivedMove.afterFen:", receivedMove.afterFen);
            try {
                game.load(receivedMove.afterFen);
                setFen(game.fen()); 
                boardUpdatedByEcho = true;
                console.log("[ChessGame handleReceiveMove ECHO] Local game FEN updated to:", game.fen());
            } catch (e) {
                console.error("[ChessGame handleReceiveMove ECHO] Error loading FEN from afterFen:", e, "FEN was:", receivedMove.afterFen);
                console.error("[ChessGame handleReceiveMove ECHO] Requesting FEN sync due to load error.");
                socket.emit("requestFenSync", { roomId }); 
            }
        } else {
            if (receivedMove.special === 'queens_domain_move' || receivedMove.specialServerEffect === 'queens_domain_consumed') {
                 console.warn("[ChessGame handleReceiveMove ECHO] Successful Queen's Domain move echo received WITHOUT afterFen. Board may not update correctly. This is unexpected.");
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

        if (boardUpdatedByEcho) {
            if (game.isCheckmate()) {
                const winnerTurn = game.turn(); 
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

        if (myAdvantage?.id === 'queens_domain' &&
            (receivedMove.specialServerEffect === 'queens_domain_consumed')) { 
            
            if (queensDomainState && !queensDomainState.hasUsed) { 
                 console.log("[ChessGame handleReceiveMove ECHO] Queen's Domain use confirmed by server. Updating local QD state.");
                 setQueensDomainState({ isActive: false, hasUsed: true });
                 setIsQueensDomainToggleActive(false);
                 alert("Queen's Domain used!"); 
            }
        }
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
        
        console.log("[ChessGame handleReceiveMove ECHO] Processing complete. Returning.");
        return; 
      }

      if (!isEcho) {
        console.log(`[ChessGame OpponentMove] Processing OPPONENT's move: ${JSON.stringify(receivedMove)} from color ${receivedMove.color}`);
        let opponentBoardUpdated = false;
        const currentFenBeforeOpponentMove = game.fen(); 

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
            }
        } else {
            console.warn("[ChessGame OpponentMove] Opponent's move did NOT have afterFen. Using fallback logic. Special:", receivedMove.special);
            
            if (receivedMove.special === 'queens_domain_move' || receivedMove.specialServerEffect === 'queens_domain_consumed') {
                console.error("[ChessGame OpponentMove] Received Queen's Domain move from opponent WITHOUT afterFen. This is unexpected. Requesting FEN sync.");
                socket.emit("requestFenSync", { roomId });
            } else if (receivedMove.special === "lightning_capture") {
                if (typeof receivedMove.secondTo === 'string' && receivedMove.color) {
                    const lcGameChanged = applyLightningCaptureOpponentMove({ game, receivedMove: receivedMove as any });
                    if (lcGameChanged) { setFen(game.fen()); opponentBoardUpdated = true; }
                    else { console.error("[ChessGame OpponentMove] applyLightningCaptureOpponentMove failed."); socket.emit("requestFenSync", { roomId });}
                } else { 
                    console.error("[ChessGame OpponentMove] LC move from opponent missing data.");
                    socket.emit("requestFenSync", { roomId });
                }
            } else if (receivedMove.special === "royal_escort") {
                const reGameChanged = applyRoyalEscortOpponentMove({ game, receivedMove: receivedMove as any });
                if (reGameChanged) { setFen(game.fen()); opponentBoardUpdated = true; }
                else { console.error("[ChessGame OpponentMove] applyRoyalEscortOpponentMove failed."); socket.emit("requestFenSync", { roomId });}
            } 
            else if (receivedMove.color !== color && receivedMove.wasPawnAmbush) { 
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
            else { 
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
            if (game.isCheckmate()) {
                const winnerTurn = game.turn(); 
                const winner = winnerTurn === 'w' ? 'black' : 'white'; 
                setGameOverMessage(`${winner.charAt(0).toUpperCase() + winner.slice(1)} wins by checkmate!`);
            } else if (game.isDraw()) {
                setGameOverMessage("Draw");
            } 
            else if (game.isStalemate()) { 
                setGameOverMessage("Draw by Stalemate");
            } else if (game.isThreefoldRepetition()) {
                setGameOverMessage("Draw by Threefold Repetition");
            } else if (game.isInsufficientMaterial()) {
                setGameOverMessage("Draw by Insufficient Material");
            }
            if (isQueensDomainToggleActive) {
                setIsQueensDomainToggleActive(false);
                console.log("[ChessGame OpponentMove] Opponent's turn; resetting Queen's Domain toggle if it was active.");
            }
        } else {
            console.warn("[ChessGame OpponentMove] Opponent's move was NOT successfully applied or board not updated. State may be inconsistent if FEN sync not triggered.");
        }
        console.log("[ChessGame OpponentMove] END processing opponent's move.");
      }
      
      // Knightmare state update from server echo or opponent move
      if (receivedMove.special === 'knightmare') {
        if (isEcho && receivedMove.color === color && receivedMove.from) {
            console.log(`[KM DEBUG ChessGame] handleReceiveMove: Knightmare ECHO received. From: ${receivedMove.from}, To: ${receivedMove.to}. Current knightmareState before update: ${JSON.stringify(knightmareState)}`);
            console.log(`[KM DEBUG ChessGame] handleReceiveMove: Knightmare ECHO received. From: ${receivedMove.from}, To: ${receivedMove.to}. Current knightmareState before update: ${JSON.stringify(knightmareState)}`);
            
            if (receivedMove.updatedAdvantageStates?.knightmare) {
              setKnightmareState({ hasUsed: receivedMove.updatedAdvantageStates.knightmare.hasUsed });
              console.log(`[KM DEBUG ChessGame] handleReceiveMove: Knightmare state updated from server echo. New state: { hasUsed: ${receivedMove.updatedAdvantageStates.knightmare.hasUsed} }`);
            } else {
              // Fallback for safety, though server should always send it now
              console.warn("[KM DEBUG ChessGame] handleReceiveMove: Knightmare echo did NOT contain updatedAdvantageStates. Optimistically setting hasUsed to true.");
              setKnightmareState({ hasUsed: true });
            }

            alert("🐴 Knightmare used!"); 
            setKnightmareActiveKnight(null);
            setKnightmarePossibleMoves([]);
        } else if (!isEcho && receivedMove.color !== color) {
            // Opponent's Knightmare move. Client doesn't need to manage opponent's KM state directly.
            // Board update is handled by general FEN update.
            console.log(`[KM DEBUG ChessGame] handleReceiveMove: Opponent's Knightmare move received. From: ${receivedMove.from}, To: ${receivedMove.to}. Board update via afterFen: ${receivedMove.afterFen}.`);
        }
      }
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
        setQueensDomainState(prevState => prevState || { isActive: false, hasUsed: false }); 
        setIsQueensDomainToggleActive(false); 
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

      if (swapPlayerColor === color && myAdvantage?.id === "opening_swap") {
        setShowOpeningSwapPrompt(false);
        setOpeningSwapSelection(null);
        if (myOpeningSwapState) {
          setMyOpeningSwapState({ ...myOpeningSwapState, hasSwapped: true });
        }
      }
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
        
        game.load(fenAfterCapture); 
        activateSacrificialBlessing(availablePieces, fenAfterCapture); 
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
      console.log(`[ChessGame event] restlessKingActivated: forColor=${forColor}, remaining=${remaining}, myColor=${color}`);
      if (color) { 
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
      socket.off("restlessKingActivated", handleRestlessKingActivated); 
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
  ]); 

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
    if (color && game.turn() !== color[0]) { 
      if (restrictedToPieceType) {
        console.log("[ChessGame useEffect fen,color] Turn changed (no longer my turn), clearing Royal Decree restriction state.");
        setRestrictedToPieceType(null);
        setRoyalDecreeMessage(null);
      }
      if (knightmareActiveKnight) {
        console.log("[KM DEBUG ChessGame Fix Attempt 2] useEffect [fen,color,etc.]: Turn changed or color set, and it's not my turn. Resetting Knightmare selection.");
        setKnightmareActiveKnight(null);
        setKnightmarePossibleMoves([]);
      }
    }
  }, [fen, color, restrictedToPieceType, knightmareActiveKnight, game]); 


  const onSquareClick = (squareClicked: Square) => {
    console.log(`[KM DEBUG ChessGame] onSquareClick: Clicked ${squareClicked}. MyAdv: ${myAdvantage?.id}, Turn: ${game.turn()}, MyColor: ${color?.[0]}, knightmareActiveKnight: ${knightmareActiveKnight}`);
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
          console.log('[SB Debug onSquareClick] FEN from store for validation:', validationGame.fen()); 
          console.log('[SB Debug onSquareClick] Clicked square for placement:', squareClicked);
          const pieceOnTarget = validationGame.get(squareClicked as Square);
          console.log('[SB Debug onSquareClick] Piece on target for placement:', pieceOnTarget);
          console.log('[SB Debug onSquareClick] Typeof pieceOnTarget:', typeof pieceOnTarget);

          if (pieceOnTarget === null || typeof pieceOnTarget === 'undefined') { 
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
      return; 
    }

    if (myAdvantage?.id === "knightmare" && color && game.turn() === color[0]) {
      console.log(`[KM DEBUG ChessGame] onSquareClick: Knightmare advantage is active for current player.`);
      const pieceOnClickedSquare = game.get(squareClicked);
      console.log(`[KM DEBUG ChessGame] onSquareClick: Piece on clicked square ${squareClicked}: ${JSON.stringify(pieceOnClickedSquare)}`);

      if (!knightmareActiveKnight) { 
          console.log(`[KM DEBUG ChessGame] onSquareClick: No knightmareActiveKnight. Attempting to activate.`);
          if (pieceOnClickedSquare && pieceOnClickedSquare.type === 'n' && pieceOnClickedSquare.color === color[0]) {
              console.log(`[KM DEBUG ChessGame] onSquareClick: Clicked on player's knight at ${squareClicked}. Checking canKnightUseKnightmare with state: ${JSON.stringify(knightmareState)}.`);
              if (canKnightUseKnightmare(knightmareState)) {
                  console.log(`[KM DEBUG ChessGame] onSquareClick: canKnightUseKnightmare returned true for ${squareClicked}. Getting possible moves.`);
                  const possibleMoves = getKnightmareSquares(game, squareClicked as Square, color[0] as 'w' | 'b', knightmareState);
                  console.log(`[KM DEBUG ChessGame] onSquareClick: getKnightmareSquares for ${squareClicked} (with state: ${JSON.stringify(knightmareState)}) returned: ${JSON.stringify(possibleMoves)}`);
                  setKnightmareActiveKnight(squareClicked);
                  setKnightmarePossibleMoves(possibleMoves);
                  console.log(`[KM DEBUG ChessGame] onSquareClick: Set knightmareActiveKnight=${squareClicked}, knightmarePossibleMoves=${JSON.stringify(possibleMoves)}.`);
              } else {
                  console.log(`[KM DEBUG ChessGame] onSquareClick: canKnightUseKnightmare returned false for ${squareClicked} with state ${JSON.stringify(knightmareState)}.`);
                  setKnightmareActiveKnight(null);
                  setKnightmarePossibleMoves([]);
              }
          } else {
               console.log(`[KM DEBUG ChessGame] onSquareClick: Clicked square ${squareClicked} is not a player's knight, or no piece. Resetting active knight.`);
               setKnightmareActiveKnight(null);
               setKnightmarePossibleMoves([]);
          }
      } else { 
          console.log(`[KM DEBUG ChessGame] onSquareClick: knightmareActiveKnight is ${knightmareActiveKnight}.`);
          if (knightmarePossibleMoves.includes(squareClicked as Square)) {
              console.log(`[KM DEBUG ChessGame] onSquareClick: Clicked ${squareClicked} is in knightmarePossibleMoves. Calling makeMove with isKnightmareMove=true.`);
              makeMove(knightmareActiveKnight, squareClicked, true); 
          } else { 
              console.log(`[KM DEBUG ChessGame] onSquareClick: Clicked ${squareClicked} is NOT in knightmarePossibleMoves. Deselecting or re-evaluating.`);
              const previouslySelectedKnight = knightmareActiveKnight; 
              setKnightmareActiveKnight(null);
              setKnightmarePossibleMoves([]);
              if (squareClicked !== previouslySelectedKnight && pieceOnClickedSquare && pieceOnClickedSquare.type === 'n' && pieceOnClickedSquare.color === color[0]) {
                  console.log(`[KM DEBUG ChessGame] onSquareClick: Re-evaluating for newly clicked knight ${squareClicked}.`);
                  console.log(`[KM DEBUG ChessGame] onSquareClick: Passing knightmareState: ${JSON.stringify(knightmareState)} to canKnightUseKnightmare for new selection.`);
                   if (canKnightUseKnightmare(knightmareState)) {
                      console.log(`[KM DEBUG ChessGame] onSquareClick: canKnightUseKnightmare returned true for new knight ${squareClicked}.`);
                      const possibleMoves = getKnightmareSquares(game, squareClicked as Square, color[0] as 'w' | 'b', knightmareState);
                      console.log(`[KM DEBUG ChessGame] onSquareClick: getKnightmareSquares for new knight ${squareClicked} (with state ${JSON.stringify(knightmareState)}) returned: ${JSON.stringify(possibleMoves)}`);
                      setKnightmareActiveKnight(squareClicked);
                      setKnightmarePossibleMoves(possibleMoves);
                      console.log(`[KM DEBUG ChessGame] onSquareClick: Set knightmareActiveKnight=${squareClicked} for new selection.`);
                  } else {
                       console.log(`[KM DEBUG ChessGame] onSquareClick: New knight ${squareClicked} cannot use Knightmare.`);
                  }
              } else if (squareClicked === previouslySelectedKnight) {
                  console.log(`[KM DEBUG ChessGame] onSquareClick: Clicked active Knightmare knight ${squareClicked} again to deselect.`);
              } else {
                  console.log(`[KM DEBUG ChessGame] onSquareClick: Clicked ${squareClicked} is not a knight, so just deselecting previous active one.`);
              }
          }
      }
      return; 
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

  const makeMove = (from: string, to: string, isKnightmareMove: boolean = false) => {
    let qdAttemptPayload: ServerMovePayload | null = null;
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

    if (restrictedToPieceType && myColor && game.turn() === myColor[0] && !game.inCheck()) { 
      if (typeof from === 'string') {
        const pieceOnFromSquare = game.get(from as Square); 
        if (!pieceOnFromSquare || pieceOnFromSquare.type !== restrictedToPieceType) {
          const pieceDisplayNames: { [key: string]: string } = { "p": "Pawn", "n": "Knight", "b": "Bishop", "r": "Rook", "q": "Queen", "k": "King" };
          const niceName = restrictedToPieceType ? (pieceDisplayNames[restrictedToPieceType] || restrictedToPieceType) : "specified piece";
          alert(`Royal Decree Active: You must move a ${niceName}. (You are not in check)`); 
          return null; 
        }
      } else {
        console.warn('[Royal Decree Client] makeMove called with invalid "from" square during Royal Decree (and not in check):', from);
        return null;
      }
    }

    fenSnapshotBeforeMove.current = game.fen();

    if (
      myAdvantage?.id === "queens_domain" &&
      isQueensDomainToggleActive && 
      queensDomainState && 
      !queensDomainState.hasUsed &&
      color 
    ) {
      console.log("[ChessGame makeMove QD Attempt] Eval QD. isToggleActive:", isQueensDomainToggleActive, "State:", JSON.stringify(queensDomainState), "Piece:", game.get(from as Square)?.type, "Color:", game.get(from as Square)?.color);
      const piece = game.get(from as Square);
      if (piece?.type === 'q' && piece?.color === color[0]) {
        const clientCheckState = { isActive: true, hasUsed: queensDomainState.hasUsed }; 
        console.log("[ChessGame makeMove QD Attempt] Checking canQueenUseDomain with state:", JSON.stringify(clientCheckState));
        if (canQueenUseDomain(new Chess(fenSnapshotBeforeMove.current), from as Square, to as Square, color[0] as 'w' | 'b', clientCheckState)) {
          qdAttemptPayload = { from, to, special: 'queens_domain_move', color: color };
          console.log("[ChessGame makeMove QD Attempt] qdAttemptPayload set for QD:", JSON.stringify(qdAttemptPayload));
        } else {
          alert("Queen's Domain: Invalid path or target for special move. Will attempt as standard move if possible.");
          console.log("[ChessGame makeMove QD Attempt] canQueenUseDomain returned false. Not a QD move.");
        }
      }
    }

    if (qdAttemptPayload) {
        console.log("[ChessGame makeMove QD Emit] Emitting qdAttemptPayload:", JSON.stringify(qdAttemptPayload));
        socket.emit("sendMove", { roomId, move: qdAttemptPayload });
        return null; 
    }

    if (isAwaitingSecondLcMove && lcFirstMoveDetails && lcFenAfterFirstMove && myColor) {
      const selectedSecondSquare = to; 
      console.log(
        `[ChessGame makeMove] Handling second LC move. Piece moved from ${lcFirstMoveDetails.to} to ${selectedSecondSquare}. Initial move was ${lcFirstMoveDetails.from} -> ${lcFirstMoveDetails.to}.`,
      );

      if (!lcPossibleSecondMoves.includes(selectedSecondSquare)) {
        alert("Invalid second move for Lightning Capture. Click a highlighted square.");
        return null;
      }

      const gameForSecondLcMove = new Chess(lcFenAfterFirstMove);
      const parts = gameForSecondLcMove.fen().split(" ");
      parts[1] = myColor === "white" ? "w" : "b";
      try {
        gameForSecondLcMove.load(parts.join(" "));
      } catch (e) {
        console.error("Error loading FEN for second LC move:", e);
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
        from: lcFirstMoveDetails.to, 
        to: selectedSecondSquare,
        promotion: 'q', 
      });

      if (actualSecondMove) {
        setFen(gameForSecondLcMove.fen());
        game.load(gameForSecondLcMove.fen()); 

        checkAndEmitRestlessKing(actualSecondMove, roomId);

        socket.emit("sendMove", {
          roomId,
          move: {
            from: lcFirstMoveDetails.from, 
            to: lcFirstMoveDetails.to,     
            secondTo: selectedSecondSquare, 
            special: 'lightning_capture',
            color: myColor,
          },
        });

        setLightningCaptureState({ used: true });
        setIsLightningCaptureActive(false); 
        setIsAwaitingSecondLcMove(false);
        setLcPossibleSecondMoves([]);
        setLcFirstMoveDetails(null);
        setLcFenAfterFirstMove(null);

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
        return actualSecondMove; 
      } else {
        alert("Lightning Capture: Second move is invalid or resulted in an illegal position.");
        game.load(fenSnapshotBeforeMove.current); 
        setFen(fenSnapshotBeforeMove.current);
        
        setIsLightningCaptureActive(false);
        setIsAwaitingSecondLcMove(false);
        setLcPossibleSecondMoves([]);
        setLcFirstMoveDetails(null);
        setLcFenAfterFirstMove(null);
        return null;
      }
    }

    const opponentShieldedPieceInfo: ShieldedPieceInfo | null = null; 
    if (
      isAttemptToCaptureShieldedPieceClient(to, opponentShieldedPieceInfo, game)
    ) {
      alert(
        "Client check: This piece is protected by Silent Shield and cannot be captured.",
      );
      return null; 
    }

    let move: any; 

    if (
      myAdvantage?.id === "lightning_capture" &&
      isLightningCaptureActive && 
      !lightningCaptureState.used && 
      !isAwaitingSecondLcMove && 
      myColor
    ) {
      console.log(
        `[ChessGame makeMove] Attempting Lightning Capture - First Move from ${from} to ${to}`,
      );
      const gameInstanceForLC = new Chess(fenSnapshotBeforeMove.current);
      const lcResult = handleLightningCaptureClient({
        game: gameInstanceForLC, 
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
        setIsAwaitingSecondLcMove(true); 
        setFen(lcResult.fenAfterFirstCapture); 
        return null; 
      } else { 
        console.log("[ChessGame makeMove] LC First Move FAILED:", lcResult);
        let failureMessage = `Lightning Capture Failed: ${lcResult.reason}`;
        if (lcResult.reason === "not_capture") {
          failureMessage = "Lightning Capture requires a valid capture as the first move.";
        } else if (lcResult.reason === "no_second_moves") {
          failureMessage = "Lightning Capture Failed: No valid second moves available after the first capture.";
        }
        alert(failureMessage);
        if (game.fen() !== fenSnapshotBeforeMove.current) {
          console.log(`[ChessGame makeMove] Reverting game state from ${game.fen()} to ${fenSnapshotBeforeMove.current}`);
          game.load(fenSnapshotBeforeMove.current);
          setFen(fenSnapshotBeforeMove.current);
        }
        setIsLightningCaptureActive(false); 
        setIsAwaitingSecondLcMove(false);
        setLcPossibleSecondMoves([]);
        setLcFirstMoveDetails(null);
        setLcFenAfterFirstMove(null);
        return null; 
      }
    }

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
        socket.emit("sendMove", { roomId, move: royalEscortResult.moveData });
        setRoyalEscortState((prevState) => ({
          ...prevState!,
          usedCount: prevState!.usedCount + 1,
        }));
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
        return null;
      }
    }

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
        socket.emit("sendMove", { roomId, move: castleMasterResult.moveData });
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
        return castleMasterResult.moveData;
      } else if (castleMasterResult.advantageUsed) {
        return null;
      }
    }

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
          socket.emit("sendMove", {
            roomId,
            move: focusedBishopResult.moveData,
          });
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
          return null;
        }
      }
    }

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
        setFen(game.fen()); 

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
        console.log(
          "[ChessGame] makeMove: Emitting Corner Blitz move to server:",
          cornerBlitzResult.moveData,
        );
        socket.emit("sendMove", { roomId, move: cornerBlitzResult.moveData });
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
        return cornerBlitzResult.moveData;
      } else if (
        cornerBlitzResult.rookMovedKey &&
        !cornerBlitzResult.moveData
      ) {
        console.log(
          `[ChessGame] makeMove: Corner Blitz attempt for rook ${cornerBlitzResult.rookMovedKey} failed locally. Not sending to server or trying as standard move.`,
        );
        return null;
      }
    }

      // Knightmare Move Logic (if isKnightmareMove is true)
      // This needs to be placed before standard move logic
      if (!move && isKnightmareMove && myAdvantage?.id === 'knightmare' && knightmareState && color) { // myColor was changed to color
        console.log(`[KM DEBUG ChessGame] makeMove: Attempting Knightmare move from ${from} to ${to}. Active Knight: ${knightmareActiveKnight}`);
        
        if (from !== knightmareActiveKnight) { 
            alert("Selected knight for Knightmare (" + (knightmareActiveKnight || "None") + ") does not match the piece being moved (" + from + "). Please reselect.");
            setKnightmareActiveKnight(null);
            setKnightmarePossibleMoves([]);
            return null;
        }

        if (!canKnightUseKnightmare(knightmareState)) { 
            alert("Knightmare has already been used or client state is out of sync. Please try again.");
            setKnightmareActiveKnight(null); 
            setKnightmarePossibleMoves([]);
            return null;
        }
        console.log(`[KM DEBUG ChessGame] makeMove: Calling handleKnightmareClientMove with game, from=${from}, to=${to}, color=${color}, state=${JSON.stringify(knightmareState)}`);
        const knightmarePayload = handleKnightmareClientMove({
          game, 
          from,
          to,
          color: color, 
          knightmareState, // Pass the state, though handleKnightmareClientMove might not use its internals directly
        });
        console.log(`[KM DEBUG ChessGame] makeMove: handleKnightmareClientMove returned: ${JSON.stringify(knightmarePayload)}`);

        if (knightmarePayload) {
          fenSnapshotBeforeMove.current = game.fen(); 
          
          // Optimistic Update for Knightmare (simplified)
          setKnightmareState({ hasUsed: true });
          console.log("[KM DEBUG ChessGame] makeMove: Optimistically updated Knightmare state to hasUsed: true.");
          
          socket.emit("sendMove", { roomId, move: knightmarePayload });
          
          setKnightmareActiveKnight(null);
          setKnightmarePossibleMoves([]);
          console.log("[KM DEBUG ChessGame] makeMove: Knightmare payload sent. UI reset.");
          return { from, to, piece: game.get(from as Square)?.type || 'n' }; 
        } else {
          alert("Invalid Knightmare move attempt (client validation failed).");
          setKnightmareActiveKnight(null); 
          setKnightmarePossibleMoves([]);
          return null; 
        }
      }

    // Fallback: standard move
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
        const standardMoveAttempt = gameForStandardMove.move({ 
          from,
          to,
          ...(isPawnPromotion ? { promotion: "q" } : {}),
        });

        if (standardMoveAttempt) {
          let serverPayload: ServerMovePayload = { 
            from: standardMoveAttempt.from,
            to: standardMoveAttempt.to,
            color: myColor, 
            promotion: standardMoveAttempt.promotion 
          };

          if (standardMoveAttempt.piece === 'p' && !standardMoveAttempt.promotion && myAdvantage?.id === 'pawn_ambush' && myColor) {
            const gameAfterPawnMove = new Chess(gameForStandardMove.fen());
            
            const ambushResult = handlePawnAmbushClient({
              game: gameAfterPawnMove, 
              move: standardMoveAttempt, 
              playerColor: myColor,
              advantage: myAdvantage,
            });

            if (ambushResult.promotionApplied && ambushResult.fen) {
              console.log("[ChessGame makeMove] Pawn Ambush applied locally by client. Updating board and payload.");
              game.load(ambushResult.fen); 
              setFen(ambushResult.fen);     

              serverPayload.wasPawnAmbush = true;
              serverPayload.promotion = 'q'; 
              
              checkAndEmitRestlessKing(standardMoveAttempt, roomId); 
              socket.emit("sendMove", { roomId, move: serverPayload });
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
              return standardMoveAttempt; 
            }
          }
          
          game.load(gameForStandardMove.fen()); 
          setFen(game.fen());
          move = standardMoveAttempt; 
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

    if (move) {
      let movePayloadToSend: ServerMovePayload;

      if (typeof (move as any).flags === 'string') { 
        movePayloadToSend = {
          from: move.from,
          to: move.to,
          color: myColor!, 
          promotion: move.promotion,
        };
      } else { 
        movePayloadToSend = move as ServerMovePayload;
        if (!movePayloadToSend.color && myColor) {
            movePayloadToSend.color = myColor;
        }
      }
      
      checkAndEmitRestlessKing(move, roomId); 

      console.log("[ChessGame] makeMove: Emitting move to server (standard or other advantage):", movePayloadToSend);
      socket.emit("sendMove", { roomId, move: movePayloadToSend });

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

    if (move && isQueensDomainToggleActive && !qdAttemptPayload) {
        setIsQueensDomainToggleActive(false);
        console.log("QD Toggle active, but a non-QD move was made or QD client check failed. Resetting toggle.");
    }
    return move; 
  };

  const handleCancelLc = () => {
    setIsLightningCaptureActive(false);
    setIsAwaitingSecondLcMove(false);
    setLcPossibleSecondMoves([]);
    setLcFirstMoveDetails(null);
    setLcFenAfterFirstMove(null); 

    if (fenSnapshotBeforeMove.current) { 
      game.load(fenSnapshotBeforeMove.current);
      setFen(fenSnapshotBeforeMove.current);
    } else {
      console.warn("[ChessGame handleCancelLc] fenSnapshotBeforeMove.current was not set, cannot revert.");
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
              }}>Skip Swap / Cancel</button>
            </div>
          )}
          {myAdvantage.id === "royal_decree" && !hasUsedRoyalDecree && (
            <div style={{ marginTop: '10px' }}>
              <button
                onClick={() => {
                  const pieceTypes = ["p", "n", "b", "r", "q", "k"];
                  const pieceDisplayNames: { [key: string]: string } = { 
                    "p": "Pawn", "n": "Knight", "b": "Bishop",
                    "r": "Rook", "q": "Queen", "k": "King"
                  };
                  const promptMessage = "Royal Decree: Enter piece type to restrict opponent to\n(p=Pawn, n=Knight, b=Bishop, r=Rook, q=Queen, k=King):";
                  const selectedPieceTypeInput = window.prompt(promptMessage)?.toLowerCase();

                  if (selectedPieceTypeInput && pieceTypes.includes(selectedPieceTypeInput)) {
                    console.log(`[Royal Decree Client] Activating. Opponent will be restricted to: ${pieceDisplayNames[selectedPieceTypeInput]}`);
                    socket.emit("royalDecree", { roomId, pieceType: selectedPieceTypeInput });
                    setHasUsedRoyalDecree(true);
                  } else if (selectedPieceTypeInput) { 
                    alert("Invalid piece type entered. Please use one of: p, n, b, r, q, k.");
                    console.log(`[Royal Decree Client] Invalid piece type entered: ${selectedPieceTypeInput}`);
                  } else { 
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
                const newToggleState = !isQueensDomainToggleActive; 
                setIsQueensDomainToggleActive(newToggleState); 

                if (newToggleState) {
                  alert("Queen's Domain activated! Your next queen move can pass through friendly pieces.");
                } else {
                  alert("Queen's Domain deactivated for the next move.");
                }

                console.log("[ChessGame QD Button] Clicked. New isQueensDomainToggleActive:", newToggleState, "Emitting setAdvantageActiveState with isActive:", newToggleState);
                if (roomId && myAdvantage?.id === 'queens_domain' && queensDomainState && !queensDomainState.hasUsed) {
                  socket.emit("setAdvantageActiveState", {
                    roomId,
                    advantageId: "queens_domain",
                    isActive: newToggleState, 
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
            return !!makeMove(from, to); 
          }}
          boardWidth={500}
          boardOrientation={color === "black" ? "black" : "white"}
          customSquareStyles={(() => {
            let styles: { [key: string]: React.CSSProperties } = {};

            // Knightmare Highlighting
            // console.log(`[KM DEBUG ChessGame] customSquareStyles called. knightmareActiveKnight: ${knightmareActiveKnight}, knightmarePossibleMoves: ${JSON.stringify(knightmarePossibleMoves)}`);
            if (myAdvantage?.id === 'knightmare' && knightmareActiveKnight && color && game.turn() === color[0]) {
               console.log(`[KM DEBUG ChessGame] customSquareStyles: Knightmare active. Highlighting ${knightmareActiveKnight} and moves: ${JSON.stringify(knightmarePossibleMoves)}`);
               styles[knightmareActiveKnight] = { 
                 ...styles[knightmareActiveKnight], 
                 background: "rgba(255, 200, 0, 0.4)", 
                 boxShadow: "0 0 5px 2px rgba(255, 165, 0, 0.8)", 
               };
               knightmarePossibleMoves.forEach(sq => {
                   styles[sq] = { 
                     ...styles[sq], 
                     background: "rgba(240, 230, 140, 0.5)", 
                     cursor: "pointer", 
                   };
               });
            }

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
                  styles[sq] = { ...styles[sq], background: "rgba(220, 180, 255, 0.4)" }; 
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
              availablePiecesForBlessing.forEach(p => {
                styles[p.square] = { ...styles[p.square], background: "rgba(173, 216, 230, 0.7)", cursor: 'pointer' };
              });
              if (selectedPieceForBlessing) {
                const blessingFenForStyling = useSacrificialBlessingStore.getState().currentBlessingFen;
                if (!blessingFenForStyling) {
                  console.error('[SB Debug customSquareStyles] No blessingFenForStyling available from store.');
                  return styles; 
                }

                const stylingGame = new Chess();
                console.log('[SB Debug customSquareStyles] stylingGame created. Initial FEN:', stylingGame.fen());
                try {
                  stylingGame.load(blessingFenForStyling); 
                  console.log('[SB Debug customSquareStyles] stylingGame loaded with store FEN. Current FEN:', stylingGame.fen());
                } catch (e) {
                  console.error("[SB Debug customSquareStyles] Error loading FEN from store into stylingGame:", e);
                  return styles; 
                }
                console.log('[SB Debug customSquareStyles] FEN from store for styling:', stylingGame.fen()); 
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
