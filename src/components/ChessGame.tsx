import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Square } from "chess.js";
import { socket } from "../socket";
import { Advantage, ShieldedPieceInfo, ServerMovePayload, OpeningSwapState } from "../../shared/types"; // Import ServerMovePayload
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
import { Move } from "chess.js";

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
  }, [myAdvantage, game, myOpeningSwapState?.hasSwapped]); // Added dependencies

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

      if (isEcho) {
        console.log(
          "[ChessGame handleReceiveMove] Detected ECHO of my own move.",
        );
        if (receivedMove.special === "lightning_capture") {
          // Own LC move confirmed by server, update state
          setLightningCaptureState({ used: true });
          setIsLightningCaptureActive(false); // Deactivate after successful use
          setIsAwaitingSecondLcMove(false);
          setLcFirstMoveDetails(null);
          setLcPossibleSecondMoves([]);
        }
        // Process potential state updates for echo (e.g. Silent Shield update after own move)
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
        console.log(
          "[ChessGame handleReceiveMove ECHO] Processing complete. Returning.",
        );
        return;
      }

      console.log(
        `[ChessGame handleReceiveMove] Processing OPPONENT's move: ${JSON.stringify(receivedMove)}`,
      );
      let moveSuccessfullyApplied = false;
      const currentFenBeforeOpponentMove = game.fen();

      // Pawn Ambush - Opponent's move
      if (receivedMove.color !== color && receivedMove.wasPawnAmbush) {
        console.log(`[ChessGame handleReceiveMove] Opponent's move is Pawn Ambush. Current FEN: ${game.fen()}`);
        // Perform the initial pawn move to ensure it's on the target square and any capture is processed
        const initialPawnMove = game.move({ from: receivedMove.from, to: receivedMove.to });
        if (initialPawnMove) {
          console.log(`[ChessGame handleReceiveMove] Pawn Ambush: Initial pawn move applied. FEN after initial move: ${game.fen()}`);
          
          // Remove the pawn from the 'to' square
          const removedPiece = game.remove(receivedMove.to as Square);
          if (!removedPiece) {
            console.error(`[ChessGame handleReceiveMove] Pawn Ambush: Failed to remove pawn from ${receivedMove.to}. Current FEN: ${game.fen()}`);
            // Consider FEN sync or error handling
            socket.emit("requestFenSync", { roomId });
            moveSuccessfullyApplied = false;
          } else {
            console.log(`[ChessGame handleReceiveMove] Pawn Ambush: Pawn removed from ${receivedMove.to}. Piece was: ${removedPiece.type}`);
            
            // Put a queen of the correct color onto the 'to' square
            const queenPlaced = game.put(
              { type: 'q', color: receivedMove.color![0] as 'w' | 'b' },
              receivedMove.to as Square
            );
            if (!queenPlaced) {
              console.error(`[ChessGame handleReceiveMove] Pawn Ambush: Failed to place queen on ${receivedMove.to}. Attempting to revert remove. Current FEN: ${game.fen()}`);
              // Attempt to revert the removal if queen placement fails
              game.put({type: removedPiece.type, color: removedPiece.color}, receivedMove.to as Square);
              socket.emit("requestFenSync", { roomId });
              moveSuccessfullyApplied = false;
            } else {
              console.log(`[ChessGame handleReceiveMove] Pawn Ambush: Queen placed on ${receivedMove.to}. FEN after manual promotion: ${game.fen()}`);
              setFen(game.fen());
              moveSuccessfullyApplied = true;
              console.log("[ChessGame handleReceiveMove] Pawn Ambush successfully applied by opponent.");
            }
          }
        } else {
          console.error(
            `[ChessGame handleReceiveMove] Pawn Ambush: Initial pawn move FAILED. Move: ${JSON.stringify(receivedMove)}. FEN before attempt: ${currentFenBeforeOpponentMove}`
          );
          // Request FEN sync as the initial move itself failed, which is unexpected for a validated ambush
          socket.emit("requestFenSync", { roomId });
          moveSuccessfullyApplied = false;
        }
      } else if (receivedMove.special === "lightning_capture") {
        console.log(
          "[ChessGame handleReceiveMove] Opponent's move is Lightning Capture.",
        );
        if (typeof receivedMove.secondTo === 'string' && receivedMove.color) {
            const lightningCaptureData = {
                from: receivedMove.from,
                to: receivedMove.to,
                secondTo: receivedMove.secondTo,
                special: receivedMove.special as 'lightning_capture', // Assert special type
                color: receivedMove.color,
            };

            const gameChanged = applyLightningCaptureOpponentMove({
                game,
                receivedMove: lightningCaptureData,
            });

            if (gameChanged) {
                setFen(game.fen());
                moveSuccessfullyApplied = true;
            } else {
                console.error(
                    "[ChessGame handleReceiveMove] applyLightningCaptureOpponentMove returned false for LC.",
                );
                // applyLightningCaptureOpponentMove should have tried to undo, client might be desynced
                socket.emit("requestFenSync", { roomId });
                moveSuccessfullyApplied = false; 
            }
        } else {
            console.error(
                `[ChessGame handleReceiveMove] Lightning Capture move received with missing 'secondTo' (${receivedMove.secondTo}) or 'color' (${receivedMove.color}).`,
            );
            socket.emit("requestFenSync", { roomId }); // Data integrity issue
            moveSuccessfullyApplied = false;
        }
      } else if (receivedMove.special === "royal_escort") {
        console.log(
          "[ChessGame handleReceiveMove] Opponent's move is Royal Escort.",
        );
        const gameChanged = applyRoyalEscortOpponentMove({
          game,
          receivedMove: receivedMove as OpponentRoyalEscortMove,
        });
        if (gameChanged) {
          setFen(game.fen());
          moveSuccessfullyApplied = true;
        } else {
          console.error(
            "[ChessGame handleReceiveMove] Failed to apply opponent's Royal Escort move.",
          );
          // Request a FEN sync from server or handle error appropriately
          socket.emit("requestFenSync", { roomId });
        }
      } else if (receivedMove.special?.startsWith("castle-master")) {
        console.log(
          "[ChessGame handleReceiveMove] Opponent's move is Castle Master.",
        );
        const gameChanged = applyCastleMasterOpponentMove({
          game,
          receivedMove,
        });
        if (gameChanged) {
          setFen(game.fen());
          moveSuccessfullyApplied = true;
        } else {
          console.error(
            "[ChessGame handleReceiveMove] Failed to apply opponent's Castle Master move.",
          );
        }
      } else if (receivedMove.special === "pawn_rush_manual") {
        console.log(
          "[ChessGame handleReceiveMove] Opponent's move is Pawn Rush.",
        );
        const gameChanged = applyPawnRushOpponentMove({ game, receivedMove });
        if (gameChanged) {
          setFen(game.fen());
          moveSuccessfullyApplied = true;
        } else {
          console.error(
            "[ChessGame handleReceiveMove] Failed to apply opponent's Pawn Rush move.",
          );
        }
      } else if (receivedMove.special === "focused_bishop") {
        console.log(
          "[ChessGame handleReceiveMove] Opponent's move is Focused Bishop.",
        );
        const gameChanged = applyFocusedBishopOpponentMove({
          game,
          receivedMove: receivedMove as OpponentFocusedBishopMove,
        });
        if (gameChanged) {
          setFen(game.fen());
          moveSuccessfullyApplied = true;
        } else {
          console.error(
            "[ChessGame handleReceiveMove] Failed to apply opponent's Focused Bishop move.",
          );
        }
      } else if (receivedMove.special === "corner_blitz") {
        console.log(
          "[ChessGame handleReceiveMove] Opponent's move is Corner Blitz.",
        );
        const gameChanged = applyCornerBlitzOpponentMove({
          game,
          receivedMove: receivedMove as any,
        });
        if (gameChanged) {
          setFen(game.fen());
          moveSuccessfullyApplied = true;
        } else {
          console.error(
            "[ChessGame handleReceiveMove] Failed to apply opponent's Corner Blitz move.",
          );
        }
      } else {
        console.log(
          `[ChessGame handleReceiveMove] Attempting to apply opponent's STANDARD move: ${JSON.stringify(receivedMove)} on FEN: ${currentFenBeforeOpponentMove}`,
        );
        const standardMove = game.move({
          from: receivedMove.from,
          to: receivedMove.to,
          promotion: receivedMove.promotion
            ? (receivedMove.promotion as any)
            : undefined,
        });

        if (standardMove) {
          setFen(game.fen());
          moveSuccessfullyApplied = true;
          console.log(
            `[ChessGame handleReceiveMove] Opponent's standard move applied. New FEN: ${game.fen()}`,
          );
        } else {
          console.error(
            `[ChessGame handleReceiveMove] Standard game.move() FAILED for opponent's received move. ` +
              `Move: ${JSON.stringify(receivedMove)}. FEN before attempt: ${currentFenBeforeOpponentMove}. Game history: ${JSON.stringify(game.history({ verbose: true }))}`,
          );
        }
      }

      if (moveSuccessfullyApplied) {
        console.log(
          "[ChessGame handleReceiveMove] Opponent's move successfully applied. Updating state.",
        );
        if (updatedShieldedPieceFromServer) {
          // This logic might be for when the opponent's move affects *my* shielded piece,
          // or if we were tracking the opponent's shielded piece.
          // For now, only updating if it's my piece.
          if (
            myShieldedPieceInfo &&
            updatedShieldedPieceFromServer.id === myShieldedPieceInfo.id
          ) {
            console.log(
              `[ChessGame handleReceiveMove] Updating myShieldedPieceInfo (opponent move context) from ${myShieldedPieceInfo.currentSquare} to ${updatedShieldedPieceFromServer.currentSquare}`,
            );
            setMyShieldedPieceInfo(updatedShieldedPieceFromServer);
          }
          // else if (opponentShieldedPieceInfo && updatedShieldedPieceFromServer.id === opponentShieldedPieceInfo.id) {
          //   setOpponentShieldedPieceInfo(updatedShieldedPieceFromServer); // If tracking opponent's shield
          // }
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
        // Add Pawn Ambush check for opponent's move
        // The existing applyPawnAmbushOpponentMove call here might become redundant for board updates
        // if the new block above handles it. It could be kept for logging or specific UI cues if needed.
        // For now, if wasPawnAmbush is true, it's handled above. If not, this will proceed.
        // However, if the move was already handled by the new `wasPawnAmbush` block,
        // `moveSuccessfullyApplied` will be true, and this block might not need to run
        // or its effects might be benign if `applyPawnAmbushOpponentMove` is idempotent or just logs.

        // Let's ensure this part is only for logging if the new block didn't run, or if it's a different kind of ambush.
        // Given the new logic specifically checks for `wasPawnAmbush`, this existing call to
        // `applyPawnAmbushOpponentMove` might be intended for a different scenario or can be removed/refactored.
        // For now, let's assume `wasPawnAmbush` is the definitive flag from the server for this specific flow.
        // The `applyPawnAmbushOpponentMove` might have other logic (like UI cues) not covered by the direct board manipulation.
        // If `moveSuccessfullyApplied` is true from the new Pawn Ambush block, this part of the code
        // will still run but the `game` state should already be correct.
        // The original instruction mentioned: "Consider the interaction with applyPawnAmbushOpponentMove.
        // This function might become redundant for board updates but can be kept for logging or specific UI cues if needed."

        // If the move was NOT a `wasPawnAmbush` true scenario, but some other logic might trigger `applyPawnAmbushOpponentMove`
        // (e.g. if it's not just for the "pawn becomes queen" type of ambush), then it should remain.
        // Based on the subtask, the primary goal is the new block.
        // We can refine this later if `applyPawnAmbushOpponentMove` has other distinct roles.
        // For now, let's assume the new block is the primary handler for wasPawnAmbush=true.
        // The log inside `applyPawnAmbushOpponentMove` might still be useful.
        if (receivedMove.color !== color && !receivedMove.wasPawnAmbush) { 
            // Only call this if it's an opponent's move AND not the wasPawnAmbush case handled above.
            // This preserves `applyPawnAmbushOpponentMove` for other potential (non-queen-promotion) ambush types if any.
            const ambushCheckResult = applyPawnAmbushOpponentMove({ game, receivedMove });
            if (ambushCheckResult.ambushRecognized) {
                console.log("[ChessGame handleReceiveMove] Opponent's Pawn Ambush (non-transforming or other type) recognized by legacy function.");
                // If this function modified the board and `moveSuccessfullyApplied` was false,
                // it might need to set `moveSuccessfullyApplied = true` if `ambushCheckResult.boardUpdated` or similar.
                // However, the new block is more specific about the board update.
            }
        }
      } else {
        console.warn(
          "[ChessGame handleReceiveMove] Opponent's move was NOT successfully applied. State may be inconsistent.",
        );
      }
      console.log("[ChessGame handleReceiveMove] END.");
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
      // Reset selection state to allow player to try again or make a different choice
      setOpeningSwapSelection(null);
      // Keep the prompt open if it was already open, unless the failure implies it should be closed
      // For example, if failure is "game already started", then prompt should close.
      // For now, just resetting selection is fine. The prompt visibility is also tied to game.history().length.
    };
    socket.on("openingSwapFailed", handleOpeningSwapFailed);

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
    };
  }, [
    roomId,
    game,
    color,
    myAdvantage,
    myShieldedPieceInfo,
    fenSnapshotBeforeMove,
    myOpeningSwapState
  ]);
  // Note: `game` (useState object) and `fenSnapshotBeforeMove` (ref object) are stable.
  // `color`, `myAdvantage`, `myShieldedPieceInfo` are included because handlers like handleReceiveMove,
  // handleAdvantageAssigned, and the logging in cleanup depend on their current values.

  // promptSecondMove function was here and has been removed.

  // Add this function within the ChessGame component
  const handleSquareClickForSwap = (square: string) => {
    if (myAdvantage?.id === "opening_swap" && showOpeningSwapPrompt && !myOpeningSwapState?.hasSwapped && color) {
      const piece = game.get(square as Square); // react-chessboard gives 'string', chess.js needs 'Square'
      const playerRank = color === 'white' ? '1' : '8';

      // Check if the square is part of the board, otherwise piece will be null.
      // Also, ensure there's a piece on the square.
      if (!piece) {
        // If a piece was already selected, clicking an empty square could perhaps cancel selection.
        // For now, only valid pieces can be interacted with for swap.
        if (openingSwapSelection) {
          alert("Opening Swap: Please select one of your non-king pieces on your back rank to swap with " + openingSwapSelection + " or click " + openingSwapSelection + " again to deselect.");
        } else {
          alert("Opening Swap: Please select one of your non-king pieces on your back rank.");
        }
        return; // Clicked on an empty square or invalid square.
      }

      if (piece.color !== color[0] || square[1] !== playerRank || piece.type === 'k') {
        alert("Opening Swap: Please select a non-king piece on your back rank.");
        return; // Invalid selection for swap
      }

      if (!openingSwapSelection) {
        setOpeningSwapSelection(square);
        // Consider adding customSquareStyles here to highlight the selected square
        alert(`Selected ${square}. Now select the second piece to swap with, or click ${square} again to deselect.`);
      } else {
        if (openingSwapSelection === square) { // Clicked the same piece again
          setOpeningSwapSelection(null); // Deselect
          // Clear highlighting if it was added
          alert("Swap selection cancelled.");
        } else {
          // Second piece selected
          console.log(`[Opening Swap] Emitting openingSwap event for ${openingSwapSelection} and ${square}`);
          socket.emit("openingSwap", { roomId, from: openingSwapSelection, to: square });
          // UI will be fully hidden on openingSwapSuccess or if player makes a regular move / skips
          setOpeningSwapSelection(null); // Reset selection
          // setShowOpeningSwapPrompt(false); // Hide prompt after attempting, server will confirm status
        }
      }
    } else {
      // If swap is not active, clicks should ideally be ignored by this handler
      // or fall through to other click logic if any (not the case here for now).
      // This ensures that regular drag-and-drop for moves is not affected.
    }
  };

  const makeMove = (from: string, to: string) => {
    if (!color) return null;
    const myColor = color;

    // If opening swap was available but a regular move is made, hide the prompt.
    if (showOpeningSwapPrompt && game.history().length === 0) {
      setShowOpeningSwapPrompt(false);
      // Optionally, here you could also set myOpeningSwapState.hasSwapped to true
      // if making any move means forfeiting the swap.
      // Or let server handle this if player tries to swap after moving.
    }

    const turn = game.turn();
    if (
      (turn === "w" && myColor !== "white") ||
      (turn === "b" && myColor !== "black")
    ) {
      return null;
    }

    // Capture FEN before any move attempt for potential server-side deflection
    fenSnapshotBeforeMove.current = game.fen();

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
        </div>
      )}

      <div style={{ position: "relative" }}>
        <Chessboard
          position={fen}
          onSquareClick={handleSquareClickForSwap} // Add this prop
          onPieceDrop={(from, to) => {
            // Block interaction while second move is being processed for LC
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
          customSquareStyles={
            isAwaitingSecondLcMove && lcFirstMoveDetails
              ? {
                  ...lcPossibleSecondMoves.reduce(
                    (acc, sq) => ({
                      ...acc,
                      [sq]: { background: "rgba(255, 255, 0, 0.4)" },
                    }),
                    {},
                  ),
                  [lcFirstMoveDetails.to]: {
                    background: "rgba(0, 255, 0, 0.4)",
                  }, // Highlight the piece to move again
                }
              : openingSwapSelection // Highlight for Opening Swap selection
              ? {
                  [openingSwapSelection]: { background: "rgba(255, 220, 0, 0.6)" },
                }
              : {}
          }
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
