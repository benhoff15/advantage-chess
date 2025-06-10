import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Chess, PieceSymbol, Move, Square, Color } from "chess.js";
import { Chessboard } from "react-chessboard";
import { socket } from "../socket";
import { Advantage, ShieldedPieceInfo, ServerMovePayload, OpeningSwapState, SummonNoShowBishopPayload, PlayerAdvantageStates as FullPlayerAdvantageStates, RecallState } from "../../shared/types";
import { useSacrificialBlessingStore, SacrificialBlessingPiece } from "../logic/advantages/sacrificialBlessing";
import { isAttemptToCaptureShieldedPieceClient } from "../logic/advantages/silentShield";
import { handleRecallClient } from "../logic/advantages/recall"; 
import { isSummonAvailable } from "../logic/advantages/noShowBishop";
import { isVoidStepAvailable, canPieceUseVoidStep, getValidVoidStepMoves } from '../logic/advantages/voidStep';
// Square is already imported from chess.js
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
import { shouldShowQueenlyCompensationToast } from '../logic/advantages/queenlyCompensation';
import { CoordinatedPushState } from "../../shared/types";
import { isEligibleCoordinatedPushPair, validateCoordinatedPushClientMove } from "../logic/advantages/coordinatedPush";
import { shouldHidePiece } from "../logic/advantages/cloak";
import { PlayerAdvantageStates, CloakState } from "../../shared/types"; // This is the one used for opponentAdvantageStates etc.
import { applyQuantumLeapClient, getQuantumLeapPayload } from "../logic/advantages/quantumLeap";
import { handleHeirSelectionClient, getHiddenHeirDisplaySquare, isClientHeirCaptured } from "../logic/advantages/hiddenHeir";
import { toast } from "react-toastify";
// Square is already imported from chess.js

// Define the type for the chess.js Move object if not already available globally
// type ChessJsMove = ReturnType<Chess['move']>; // This is a more precise way if Chess['move'] is well-typed

function getMaskedFenForOpponent(
  fen: string,
  opponentAdvantageStates: PlayerAdvantageStates | null,
  color: "white" | "black" | null
) {
  if (!fen || !opponentAdvantageStates?.cloak || !color) return fen;
  const chess = new Chess(fen);
  const { pieceId } = opponentAdvantageStates.cloak;
  const square = pieceId.slice(0, 2);
  const type = pieceId[2];
  const myColorChar = color === "white" ? "w" : "b";
  const piece = chess.get(square as Square);
  if (piece && piece.type === type && piece.color !== myColorChar) {
    chess.remove(square as Square);
    return chess.fen();
  }
  return fen;
}

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
  const [myRecallState, setMyRecallState] = useState<RecallState | null>(null);
  const [fenHistory, setFenHistory] = useState<string[]>([]);
  const [isRecallActive, setIsRecallActive] = useState<boolean>(false);
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
const [isVoidStepToggleActive, setIsVoidStepToggleActive] = useState(false);
const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
const [validMoves, setValidMoves] = useState<Square[]>([]);
const [knightmareState, setKnightmareState] = useState<{ hasUsed: boolean } | null>(null);
const [knightmareActiveKnight, setKnightmareActiveKnight] = useState<Square | null>(null);
const [knightmarePossibleMoves, setKnightmarePossibleMoves] = useState<Square[]>([]);
const [queenlyCompensationState, setQueenlyCompensationState] = useState<{ hasUsed: boolean } | null>(null);
const [arcaneReinforcementSpawnedSquare, setArcaneReinforcementSpawnedSquare] = useState<string | null>(null);
  const [opponentAdvantageStates, setOpponentAdvantageStates] = useState<PlayerAdvantageStates | null>(null);
  const [myCloakDetails, setMyCloakDetails] = useState<CloakState | null>(null); // For displaying my own cloak status

  // Coordinated Push State Variables
  const [isCoordinatedPushActive, setIsCoordinatedPushActive] = useState(false);
  const [coordinatedPushState, setCoordinatedPushState] = useState<CoordinatedPushState | null>(null);
  const [awaitingSecondPush, setAwaitingSecondPush] = useState<boolean>(false);
  const [firstPushDetails, setFirstPushDetails] = useState<Move | null>(null);
  const [eligibleSecondPawns, setEligibleSecondPawns] = useState<Square[]>([]);
  const [secondPawnSelected, setSecondPawnSelected] = useState<Square | null>(null);

  // No-Show Bishop State Variables
  const [noShowBishopState, setNoShowBishopState] = useState<{ used: boolean; removedPiece?: { square: Square; type: PieceSymbol } } | null>(null);
  const [isSummonModeActive, setIsSummonModeActive] = useState<boolean>(false);

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

  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);
  const [whitePlayerAdvantageStates, setWhitePlayerAdvantageStates] = useState<PlayerAdvantageStates | null>(null);
  const [blackPlayerAdvantageStates, setBlackPlayerAdvantageStates] = useState<PlayerAdvantageStates | null>(null);

  // Quantum Leap States
  const [isQuantumLeapActive, setIsQuantumLeapActive] = useState<boolean>(false);
  const [quantumLeapSelections, setQuantumLeapSelections] = useState<Square[]>([]);
  const [hiddenHeirSelectionInfo, setHiddenHeirSelectionInfo] = useState<{ square: Square | null, pieceId: string | null, captured: boolean }>({ square: null, pieceId: null, captured: false });
  const [pieceTracking, setPieceTracking] = useState<Record<string, { type: string; color: string; square: string; alive: boolean }> | null>(null);

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
    }

  if (myAdvantage?.id === "opening_swap") {
    setMyOpeningSwapState({ hasSwapped: false }); 
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
  if (myAdvantage?.id === "queens_domain") {
  } else {
    if (queensDomainState) setQueensDomainState(null); 
    if (isQueensDomainToggleActive) setIsQueensDomainToggleActive(false); 
  }

  if (myAdvantage?.id === "knightmare") {
    if (!knightmareState) { 
        setKnightmareState({ hasUsed: false });
    }
  } else {
      if (knightmareState !== null) { 
        setKnightmareState(null);
      }
      if (knightmareActiveKnight !== null) {
        setKnightmareActiveKnight(null);
      }
      if (knightmarePossibleMoves.length > 0) {
        setKnightmarePossibleMoves([]);
      }
  }

  if (myAdvantage?.id === "queenly_compensation") {
    if (!queenlyCompensationState) setQueenlyCompensationState({ hasUsed: false });
  } else {
    if (queenlyCompensationState) setQueenlyCompensationState(null);
  }

  if (myAdvantage?.id !== "arcane_reinforcement") {
    if (arcaneReinforcementSpawnedSquare) setArcaneReinforcementSpawnedSquare(null);
  }

  // Coordinated Push advantage initialization/reset
  if (myAdvantage?.id === 'coordinated_push') {
    setCoordinatedPushState({ active: false, usedThisTurn: false });
    setIsCoordinatedPushActive(false);
    setAwaitingSecondPush(false);
    setFirstPushDetails(null);
    setEligibleSecondPawns([]);
    setSecondPawnSelected(null);
  } else {
    if (coordinatedPushState) setCoordinatedPushState(null);
    if (isCoordinatedPushActive) setIsCoordinatedPushActive(false);
    if (awaitingSecondPush) setAwaitingSecondPush(false);
    if (firstPushDetails) setFirstPushDetails(null);
    if (eligibleSecondPawns.length > 0) setEligibleSecondPawns([]);
    if (secondPawnSelected) setSecondPawnSelected(null);
  }

  // Reset myCloakDetails if advantage changes and is not cloak
  if (myAdvantage?.id !== 'cloak') {
    if (myCloakDetails) setMyCloakDetails(null);
  } else {
    // If advantage IS cloak, but details are not yet set (e.g. from advantageAssigned), initialize or ensure it's null
    if (!myCloakDetails) setMyCloakDetails(null); 
  }

  // No-Show Bishop advantage initialization/reset
  if (myAdvantage?.id === 'no_show_bishop') {
    // Initialize with default state; advantageAssigned will provide full details.
    setNoShowBishopState(prevState => prevState || { used: false, removedPiece: undefined });
  } else {
    if (noShowBishopState) setNoShowBishopState(null);
    if (isSummonModeActive) setIsSummonModeActive(false);
  }

  // Recall advantage reset
  if (myAdvantage?.id !== 'recall') {
    setIsRecallActive(false); // Reset active state if advantage changes away from recall
    // myRecallState will be set to null by advantageAssigned or receiveMove if needed
  }

  }, [myAdvantage, arcaneReinforcementSpawnedSquare, playerColor]);

  useEffect(() => {
    const handleAdvantageStateUpdate = (data: any) => {
      if (data.queens_domain && myAdvantage?.id === 'queens_domain') {
        console.log("[ChessGame] Received advantageStateUpdated for Queen's Domain:", data.queens_domain);
        setQueensDomainState(data.queens_domain);
        if (!data.queens_domain.isActive || data.queens_domain.hasUsed) {
          setIsQueensDomainToggleActive(false);
        }
      } else if (data.coordinatedPush && myAdvantage?.id === 'coordinated_push') {
        console.log("[ChessGame] Received advantageStateUpdated for Coordinated Push:", data.coordinatedPush);
        setCoordinatedPushState(data.coordinatedPush);
        if (data.coordinatedPush.usedThisTurn) {
            setIsCoordinatedPushActive(false); 
            setAwaitingSecondPush(false);      
            setFirstPushDetails(null);
            setEligibleSecondPawns([]);
            setSecondPawnSelected(null);
            console.log("[CP DEBUG] Coordinated Push state reset after usedThisTurn=true");
        }
      } else if (data.voidStep && myAdvantage?.id === 'void_step') {
        console.log("[ChessGame] Received advantageStateUpdated for Void Step:", data.voidStep);
        if (color === 'white') {
          setWhitePlayerAdvantageStates(prev => ({
            ...prev,
            voidStep: data.voidStep
          }));
        } else if (color === 'black') {
          setBlackPlayerAdvantageStates(prev => ({
            ...prev,
            voidStep: data.voidStep
          }));
        }
      }
      if (data.whitePlayerAdvantageStates) {
        setWhitePlayerAdvantageStates(prev => ({
          ...prev,
          ...data.whitePlayerAdvantageStates,
        }));
      }
      if (data.blackPlayerAdvantageStates) {
        setBlackPlayerAdvantageStates(prev => ({
          ...prev,
          ...data.blackPlayerAdvantageStates,
        }));
      }

      // Hidden Heir specific update from advantageStateUpdated
      if (data.playerColor === color) { // Check if the update is for the current player
        if (data.advantageStates?.hiddenHeir) {
          setHiddenHeirSelectionInfo(prev => ({
            ...prev,
            square: data.advantageStates.hiddenHeir.square || null,
            pieceId: data.advantageStates.hiddenHeir.pieceId || null,
            captured: data.advantageStates.hiddenHeirCaptured === true
          }));
          console.log("[HiddenHeir ChessGame] My Hidden Heir state updated via advantageStateUpdated (heir info present):", data.advantageStates);
        } else if (typeof data.advantageStates?.hiddenHeirCaptured === 'boolean') {
          setHiddenHeirSelectionInfo(prev => ({
            ...prev,
            captured: data.advantageStates.hiddenHeirCaptured === true
          }));
          console.log("[HiddenHeir ChessGame] My Hidden Heir capture status updated via advantageStateUpdated (only capture status):", data.advantageStates.hiddenHeirCaptured);
        }
      }
    };

    socket.on("advantageStateUpdated", handleAdvantageStateUpdate);

    return () => {
      socket.off("advantageStateUpdated", handleAdvantageStateUpdate);
    };
  }, [myAdvantage]); 

  useEffect(() => {
    if (!roomId) return;

    console.log(
      `[ChessGame useEffect] Setting up for room: ${roomId}, color: ${color}`,
    );
    socket.emit("joinRoom", roomId);

    const handleColorAssigned = (assignedColor: "white" | "black") => {
      console.log(`[ChessGame event] colorAssigned: ${assignedColor}`);
      setColor(assignedColor);
      setPlayerColor(assignedColor);
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

    const handleGameStart = (data: { fen: string; pieceTracking?: Record<string, { type: string; color: string; square: string; alive: boolean }> }) => {
      console.log("[ChessGame event] gameStart. Loading FEN:", data.fen);
      try {
        game.load(data.fen);
        setFen(game.fen());
        setFenHistory([data.fen]); // Initialize with the starting FEN
        fenSnapshotBeforeMove.current = game.fen(); 
        if (data.pieceTracking) {
          setPieceTracking(data.pieceTracking);
          console.log("[HiddenHeir] pieceTracking set on gameStart:", data.pieceTracking);
        }
      } catch (e) {
        console.error("[ChessGame event gameStart] Error loading FEN from gameStart event:", e, "FEN was:", data.fen);
        socket.emit("requestFenSync", { roomId });
      }
    };
    socket.on("gameStart", handleGameStart);
    
    type ReceiveMoveEventData = {
      move: ServerMovePayload; 
      updatedShieldedPiece?: ShieldedPieceInfo;
      whitePlayerAdvantageStatesFull?: PlayerAdvantageStates; // Added
      blackPlayerAdvantageStatesFull?: PlayerAdvantageStates; // Added
      pieceTracking?: Record<string, { type: string; color: string; square: string; alive: boolean }>;
    };

    const handleReceiveMove = (data: ReceiveMoveEventData) => {
      const receivedMove = data.move;
      const updatedShieldedPieceFromServer = data.updatedShieldedPiece;
      const whiteFullStates = data.whitePlayerAdvantageStatesFull;
      const blackFullStates = data.blackPlayerAdvantageStatesFull;
      if (data.pieceTracking) {
        setPieceTracking(data.pieceTracking);
        console.log("[HiddenHeir] pieceTracking updated on receiveMove:", data.pieceTracking);
      }

      console.log(
        `[ChessGame handleReceiveMove] START. Current color state: ${color}. Received move:`,
        receivedMove,
        "WhiteFullStates:", whiteFullStates, "BlackFullStates:", blackFullStates
      );
      if (updatedShieldedPieceFromServer) {
        console.log(
          "[ChessGame handleReceiveMove] Server sent updatedShieldedPiece:",
          updatedShieldedPieceFromServer,
        );
      }

      // Update opponent and own full advantage states
      let myCurrentFullStates: PlayerAdvantageStates | null | undefined = null;
      let oppFullStates: PlayerAdvantageStates | null | undefined = null;

      if (color === "white") {
          myCurrentFullStates = whiteFullStates;
          oppFullStates = blackFullStates;
      } else if (color === "black") {
          myCurrentFullStates = blackFullStates;
          oppFullStates = whiteFullStates;
      }

      if (oppFullStates) {
          setOpponentAdvantageStates(oppFullStates);
          console.log("[Cloak Client ChessGame] Opponent cloak state set:", oppFullStates.cloak);
      }

      if (myCurrentFullStates) {
          // console.log("[ChessGame handleReceiveMove] Updating my own full states:", myCurrentFullStates); // Too verbose
          setKnightmareState(myCurrentFullStates.knightmare || null);
          setQueensDomainState(myCurrentFullStates.queens_domain || null);
          setMyCloakDetails(myCurrentFullStates.cloak || null);
          setRoyalEscortState(myCurrentFullStates.royalEscort || null);
          setLightningCaptureState(myCurrentFullStates.lightningCapture || { used: false });
          setMyOpeningSwapState(myCurrentFullStates.openingSwap || null);
          setQueenlyCompensationState(myCurrentFullStates.queenly_compensation || null);
          setCoordinatedPushState(myCurrentFullStates.coordinatedPush || null);
          setMyRecallState(myCurrentFullStates.recall || null); // Update Recall state
          
          // Update No-Show Bishop state from full states
          if (myAdvantage?.id === 'no_show_bishop' && myCurrentFullStates?.noShowBishopUsed !== undefined) {
            console.log("[ChessGame handleReceiveMove] Updating noShowBishopState from myCurrentFullStates:", myCurrentFullStates.noShowBishopUsed, myCurrentFullStates.noShowBishopRemovedPiece);
            const incomingNsbData = myCurrentFullStates?.noShowBishopRemovedPiece;
            setNoShowBishopState(prevState => {
                const prevNsbState = prevState || { used: false, removedPiece: undefined };
                return {
                    used: myCurrentFullStates.noShowBishopUsed!, // Assert non-null
                    removedPiece: incomingNsbData ? {
                        square: incomingNsbData.square as Square,
                        type: incomingNsbData.type as PieceSymbol
                    } : prevNsbState.removedPiece
                };
            });
          }
          // Note: PawnAmbushState is not explicitly managed with useState yet, but could be added if needed locally.
          // ArcaneReinforcement (spawnedSquare) is handled in advantageAssigned.
          // SacrificialBlessing state (hasUsed) is managed by hasUsedMySacrificialBlessing.

          // Update full PlayerAdvantageStates for self based on color
          if (color === 'white' && whiteFullStates) {
            console.log("[ChessGame handleReceiveMove] Updating whitePlayerAdvantageStates with full server state:", whiteFullStates);
            setWhitePlayerAdvantageStates(prev => ({...prev, ...whiteFullStates}));
          } else if (color === 'black' && blackFullStates) {
            console.log("[ChessGame handleReceiveMove] Updating blackPlayerAdvantageStates with full server state:", blackFullStates);
            setBlackPlayerAdvantageStates(prev => ({...prev, ...blackFullStates}));
          }
          if (myCurrentFullStates?.hiddenHeir) {
            setHiddenHeirSelectionInfo({
              square: myCurrentFullStates.hiddenHeir.square as Square,
              pieceId: myCurrentFullStates.hiddenHeir.pieceId,
              captured: !!myCurrentFullStates.hiddenHeirCaptured,
            });
          } else {
            setHiddenHeirSelectionInfo({ square: null, pieceId: null, captured: !!myCurrentFullStates?.hiddenHeirCaptured });
        }
        // Hidden Heir related console logs after state updates from full sync
        if (myAdvantage?.id === 'hidden_heir') {
            const myStatesToLog = color === 'white' ? whitePlayerAdvantageStates : blackPlayerAdvantageStates;
            if (myStatesToLog?.hiddenHeir?.square) { // Check if heir is set before logging
                console.log(`[HiddenHeir Log handleReceiveMove] My Heir: ${myStatesToLog.hiddenHeir.pieceId} on ${myStatesToLog.hiddenHeir.square}. Captured: ${myStatesToLog.hiddenHeirCaptured}`);
            } else if (myStatesToLog) { // Log even if heir is not set, but states exist
                 console.log(`[HiddenHeir Log handleReceiveMove] My Hidden Heir not set or info missing. Captured status: ${myStatesToLog.hiddenHeirCaptured}`);
            }

            const opponentStatesToLog = color === 'white' ? blackPlayerAdvantageStates : whitePlayerAdvantageStates;
            if (opponentStatesToLog?.hiddenHeir?.square && opponentStatesToLog.hiddenHeirCaptured) { // Only log opponent's if set AND captured
                console.log(`[HiddenHeir Log handleReceiveMove] Opponent's Heir: ${opponentStatesToLog.hiddenHeir.pieceId} on ${opponentStatesToLog.hiddenHeir.square} was captured.`);
            }
        }
      }
      console.log(`[Cloak Client ChessGame - handleReceiveMove] Post-move states updated. Opponent Cloak: ${JSON.stringify(oppFullStates?.cloak)}. My Cloak: ${JSON.stringify(myCurrentFullStates?.cloak)}`);


      if (isAwaitingSecondLcMove) {
        console.warn(
          "[ChessGame handleReceiveMove] Ignoring opponent move while awaiting second LC move.",
        );
        return;
      }

      console.log("[ChessGame handleReceiveMove] Comparing for echo: receivedMove.color=", receivedMove.color, "component color=", color);
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
            setFenHistory(prevHistory => {
                if (prevHistory.length > 0 && prevHistory[prevHistory.length - 1] === game.fen()) {
                    return prevHistory;
                }
                const newHist = [...prevHistory, game.fen()];
                return newHist; 
            });
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

        if (receivedMove.updatedAdvantageStates?.queenly_compensation && myAdvantage?.id === 'queenly_compensation') {
          setQueenlyCompensationState(receivedMove.updatedAdvantageStates.queenly_compensation);
          console.log("[ChessGame handleReceiveMove ECHO] Queenly Compensation state updated from server echo:", receivedMove.updatedAdvantageStates.queenly_compensation);
        }
        
        if (receivedMove.special === 'coordinated_push') {
            if (receivedMove.updatedAdvantageStates?.coordinatedPush) {
                setCoordinatedPushState(receivedMove.updatedAdvantageStates.coordinatedPush);
                 console.log("[ChessGame handleReceiveMove ECHO CP] Coordinated Push state updated from server echo:", receivedMove.updatedAdvantageStates.coordinatedPush);
            } else if (coordinatedPushState && !coordinatedPushState.usedThisTurn) {
                setCoordinatedPushState({ ...coordinatedPushState, usedThisTurn: true });
                console.log("[ChessGame handleReceiveMove ECHO CP] Coordinated Push state updated (fallback to hasUsed:true) due to echo.");
            }
            setIsCoordinatedPushActive(false);
            setAwaitingSecondPush(false);
            setFirstPushDetails(null);
            setEligibleSecondPawns([]);
            setSecondPawnSelected(null);
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
            setFenHistory(prevHistory => {
                if (prevHistory.length > 0 && prevHistory[prevHistory.length - 1] === game.fen()) {
                    return prevHistory;
                }
                const newHist = [...prevHistory, game.fen()];
                return newHist;
            });
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
            if (receivedMove.updatedAdvantageStates?.knightmare) {
              setKnightmareState({ hasUsed: receivedMove.updatedAdvantageStates.knightmare.hasUsed });
            } else {
              setKnightmareState({ hasUsed: true });
            }
            alert("🐴 Knightmare used!"); 
            setKnightmareActiveKnight(null);
            setKnightmarePossibleMoves([]);
        } else if (!isEcho && receivedMove.color !== color) {
            // Opponent's Knightmare move.
        }
      }
      
      // Opponent's Coordinated Push move (if not covered by afterFen)
      if (!isEcho && receivedMove.special === 'coordinated_push' && !receivedMove.afterFen) {
        console.warn("[ChessGame OpponentMove CP Fallback] Opponent's Coordinated Push received without afterFen. Attempting manual application.");
        if (receivedMove.from && receivedMove.to && receivedMove.secondFrom && receivedMove.secondTo) {
            const firstOpponentMove = game.move({ from: receivedMove.from as Square, to: receivedMove.to as Square });
            if (firstOpponentMove) {
                const secondOpponentMove = game.move({ from: receivedMove.secondFrom as Square, to: receivedMove.secondTo as Square });
                if (secondOpponentMove) {
                    setFen(game.fen());
                } else {
                    console.error("[ChessGame OpponentMove CP Fallback] Failed to apply second part of opponent's Coordinated Push. Requesting FEN sync.");
                    socket.emit("requestFenSync", { roomId });
                }
            } else {
                console.error("[ChessGame OpponentMove CP Fallback] Failed to apply first part of opponent's Coordinated Push. Requesting FEN sync.");
                socket.emit("requestFenSync", { roomId });
            }
        } else {
            console.error("[ChessGame OpponentMove CP Fallback] Opponent's Coordinated Push missing required fields (from, to, secondFrom, secondTo). Requesting FEN sync.");
            socket.emit("requestFenSync", { roomId });
        }
      }
      if (!isEcho && game.turn() === color?.[0]) {
        if (myAdvantage?.id === 'coordinated_push' && coordinatedPushState && coordinatedPushState.usedThisTurn) {
        }
        if (awaitingSecondPush) {
            setAwaitingSecondPush(false);
            setFirstPushDetails(null);
            setEligibleSecondPawns([]);
            setSecondPawnSelected(null);
            setIsCoordinatedPushActive(false); 
             if (fenSnapshotBeforeMove.current && game.fen() !== fenSnapshotBeforeMove.current) {
            }
        }
      }


      // Queenly Compensation Toast Notifications (after FEN has been updated)
      if (color) { 
        if (shouldShowQueenlyCompensationToast({ move: receivedMove, myColor: color, myAdvantageId: myAdvantage?.id })) {
          alert("♘ Queenly Compensation: A knight rises where your queen fell.");
          if (receivedMove.updatedAdvantageStates?.queenly_compensation) {
            setQueenlyCompensationState(receivedMove.updatedAdvantageStates.queenly_compensation);
            console.log("[ChessGame QC Toast] QC state updated from receivedMove.updatedAdvantageStates:", receivedMove.updatedAdvantageStates.queenly_compensation);
          } else if (isEcho) { 
            setQueenlyCompensationState({ hasUsed: true });
            console.log("[ChessGame QC Toast] QC state updated (fallback to hasUsed:true) due to echo.");
          }
        } else {
          const playerWhoseQueenWasCompensated = receivedMove.color === 'white' ? 'black' : 'white';
          if (receivedMove.specialServerEffect === 'queenly_compensation_triggered' && playerWhoseQueenWasCompensated !== color) {
              const homeSquare = playerWhoseQueenWasCompensated === 'white' ? 'd1' : 'd8';
              alert(`Opponent's Queenly Compensation triggered: A knight appeared on ${homeSquare}.`);
          }
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
      advantageDetails?: any; 
    }) => {
      console.log('[Arcane Reinforcement Debug Client] Received advantageAssigned event. Data:', JSON.stringify(data));
      console.log("[ChessGame event] advantageAssigned:", data); 
      setMyAdvantage(data.advantage);
      setArcaneReinforcementSpawnedSquare(null); 

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
      } else if (data.advantage.id === 'queenly_compensation') {
        setQueenlyCompensationState({ hasUsed: false });
        console.log("[ChessGame handleAdvantageAssigned] Queenly Compensation advantage assigned, state initialized.");
      } else if (data.advantage.id === 'void_step') {
        const voidStepState = { isActive: false, hasUsed: false };
        if (color === 'white') {
          setWhitePlayerAdvantageStates(prev => ({
            ...prev,
            voidStep: voidStepState
          }));
        } else if (color === 'black') {
          setBlackPlayerAdvantageStates(prev => ({
            ...prev,
            voidStep: voidStepState
          }));
        }
        console.log("[ChessGame handleAdvantageAssigned] Void Step advantage assigned, state initialized:", voidStepState);
      } else if (data.advantage.id === 'arcane_reinforcement') {
        if (data.advantageDetails && typeof data.advantageDetails.spawnedSquare === 'string' && data.advantageDetails.spawnedSquare.length > 0) {
          setArcaneReinforcementSpawnedSquare(data.advantageDetails.spawnedSquare);
          alert("🧙 Arcane Reinforcement: You begin with an extra bishop!");
          console.log(`[ChessGame] Arcane Reinforcement: Bishop spawned at ${data.advantageDetails.spawnedSquare}`);
        } else if (data.advantageDetails && data.advantageDetails.spawnedSquare === null) {
          setArcaneReinforcementSpawnedSquare(null);
          alert("🧙 Arcane Reinforcement: No empty squares available to place the extra bishop.");
          console.log('[ChessGame] Arcane Reinforcement: Skipped by server, no empty squares were available.');
        } else {
          setArcaneReinforcementSpawnedSquare(null);
          alert("🧙 Arcane Reinforcement is active, but its effect might not apply correctly due to missing spawn details.");
          console.log('[ChessGame] Arcane Reinforcement active, but spawnedSquare was missing, undefined, or invalid in advantageDetails.');
        }
      }
      // Handle Cloak advantage assignment for self
      if (data.advantage.id === 'cloak' && data.advantageDetails?.cloak) {
        setMyCloakDetails(data.advantageDetails.cloak);
        console.log(`[Cloak Client ChessGame - handleAdvantageAssigned] Cloak assigned to me. Details:`, JSON.stringify(data.advantageDetails.cloak));
      } else if (data.advantage.id === 'cloak' && !data.advantageDetails?.cloak) {
        // This case might happen if details are missing, though server should provide them
        setMyCloakDetails(null); // Or some default initial state if appropriate
        console.warn(`[Cloak Client ChessGame - handleAdvantageAssigned] Cloak assigned but details missing.`);
      }

      // Handle No-Show Bishop advantage assignment
      if (data.advantage.id === 'recall') {
        const initialRecallState = data.advantageDetails?.recallState || { used: false };
        setMyRecallState(initialRecallState);
        console.log("[Recall Client] Recall advantage assigned, state initialized:", initialRecallState);
      } else if (data.advantage.id === 'no_show_bishop') {
        const used = data.advantageDetails?.noShowBishopUsed || false;
        const details = data.advantageDetails?.removedBishopDetails;
        console.log(`[No-Show Bishop Client] advantageAssigned: used=${used}, removedPiece=`, details);
        
        setNoShowBishopState({ 
            used: used, 
            removedPiece: details ? {
                square: details.square as Square,
                type: details.type as PieceSymbol
            } : undefined 
        });
        console.log(`[No-Show Bishop Client ChessGame - handleAdvantageAssigned] No-Show Bishop assigned. Used: ${used}, Removed Piece:`, details);

        if (details) {
          // Ensure correct type for PieceSymbol if needed for display, though it's usually a char like 'b'
          const pieceTypeDisplay = details.type.toUpperCase(); 
          alert(`No-Show Bishop: Your ${pieceTypeDisplay} on ${details.square} has been removed. You can summon it before turn 10 (i.e. before your 10th move / history length 20).`);
        } else if (myAdvantage?.id === 'no_show_bishop' && !details) {
          // This case means the advantage is active, but no piece was removed (e.g. server couldn't find one)
          alert("No-Show Bishop: Advantage active, but no piece was removed (e.g., no standard bishops found on starting squares). You may not be able to summon a piece.");
           console.warn("[No-Show Bishop Client ChessGame - handleAdvantageAssigned] No-Show Bishop active, but no removedBishopDetails provided by server.");
        }
      }
      if (data.advantage.id === 'quantum_leap' && data.advantageDetails?.quantumLeapUsed !== undefined) {
        const qlUsed = data.advantageDetails.quantumLeapUsed;
        if (color === 'white') {
          setWhitePlayerAdvantageStates(prev => ({ ...prev, quantumLeapUsed: qlUsed }));
        } else if (color === 'black') {
          setBlackPlayerAdvantageStates(prev => ({ ...prev, quantumLeapUsed: qlUsed }));
        }
        console.log(`[ChessGame handleAdvantageAssigned] Quantum Leap assigned. quantumLeapUsed set to: ${qlUsed}`);
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
        setGameOverMessage(null);
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
      setFenHistory(prev => [...prev, newFen]);

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
      setFenHistory(prev => [...prev, newFen]);
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

    // No-Show Bishop Listeners
    const handleBishopSummoned = (data: {
      newFen: string;
      playerColor: 'white' | 'black';
      summonedSquare: Square;
      pieceType: PieceSymbol;
      noShowBishopUsed: boolean; // This is specific to the player who summoned
      whitePlayerAdvantageStatesFull?: FullPlayerAdvantageStates;
      blackPlayerAdvantageStatesFull?: FullPlayerAdvantageStates;
    }) => {
      console.log("[No-Show Bishop Client] bishopSummoned event received:", data);
      console.log("[No-Show Bishop Client] Loading new FEN after summon:", data.newFen);
      game.load(data.newFen);
      setFen(game.fen());
      setFenHistory(prev => [...prev, data.newFen]);
      fenSnapshotBeforeMove.current = game.fen(); // Update snapshot

      alert(`Player ${data.playerColor} summoned their ${data.pieceType.toUpperCase()} to ${data.summonedSquare}.`);

      const myUpdatedFullStates = color === 'white' ? data.whitePlayerAdvantageStatesFull : data.blackPlayerAdvantageStatesFull;
      const oppUpdatedFullStates = color === 'white' ? data.blackPlayerAdvantageStatesFull : data.whitePlayerAdvantageStatesFull;

      if (myAdvantage?.id === 'no_show_bishop' && myUpdatedFullStates?.noShowBishopUsed !== undefined) {
        console.log("[No-Show Bishop Client bishopSummoned] Updating my noShowBishopState from myUpdatedFullStates:", myUpdatedFullStates);
        const incomingNsbSummonData = myUpdatedFullStates?.noShowBishopRemovedPiece;
        setNoShowBishopState(prevState => {
          const prevNsbState = prevState || { used: true, removedPiece: undefined };
          return {
            used: myUpdatedFullStates!.noShowBishopUsed!,
            removedPiece: incomingNsbSummonData ? {
              square: incomingNsbSummonData.square as Square,
              type: incomingNsbSummonData.type as PieceSymbol
            } : prevNsbState.removedPiece
          };
        });
      } else if (data.playerColor === color && myAdvantage?.id === 'no_show_bishop') {
        console.log("[No-Show Bishop Client bishopSummoned] Fallback: Updating my noShowBishopState as used because I summoned.");
        setNoShowBishopState(prevState => ({
          ...(prevState || { used: true, removedPiece: undefined }),
          used: true,
        }));
      }

      if (oppUpdatedFullStates) {
        setOpponentAdvantageStates(oppUpdatedFullStates);
      }

      // Log game over state after summon
      if (game.isCheckmate()) {
        const winner = game.turn() === "w" ? "black" : "white";
        setGameOverMessage(`${winner.charAt(0).toUpperCase() + winner.slice(1)} wins by checkmate!`);
        console.log("[No-Show Bishop Client] Game over by checkmate after bishop summon.");
      } else if (game.isDraw()) {
        setGameOverMessage("Draw!");
        console.log("[No-Show Bishop Client] Game over by draw after bishop summon.");
      }
    };
    socket.on("bishopSummoned", handleBishopSummoned);

    const handleSummonBishopFailed = (data: { message: string }) => {
      console.warn("[No-Show Bishop Client] summonBishopFailed event received:", data);
      alert(`Summon Failed: ${data.message}`);
      setIsSummonModeActive(false);
    };
    socket.on("summonBishopFailed", handleSummonBishopFailed);

    const handleQuantumLeapApplied = ({ from, to, fen: newFen, playerColor: eventPlayerColor, updatedAdvantageStatesForPlayer }: { from: Square, to: Square, fen: string, playerColor: 'w' | 'b', updatedAdvantageStatesForPlayer: { quantumLeapUsed: boolean } }) => {
      console.log(`[ChessGame] quantum_leap_swap_applied received. From: ${from}, To: ${to}, FEN: ${newFen}, Player: ${eventPlayerColor}`);
      const wasMySwap = eventPlayerColor === color?.[0];

      applyQuantumLeapClient({ game, from, to, newFen, isMyMove: wasMySwap });
      setFen(game.fen());
      setFenHistory(prev => [...prev, game.fen()]);

      if (wasMySwap) {
        if (color === 'white') {
          setWhitePlayerAdvantageStates(prev => ({ ...prev, quantumLeapUsed: updatedAdvantageStatesForPlayer.quantumLeapUsed }));
        } else if (color === 'black') {
          setBlackPlayerAdvantageStates(prev => ({ ...prev, quantumLeapUsed: updatedAdvantageStatesForPlayer.quantumLeapUsed }));
        }
        alert("Quantum Leap successful!");
      } else {
        // Opponent used Quantum Leap
        if (eventPlayerColor === 'w') { // Opponent was white
          setWhitePlayerAdvantageStates(prev => ({ ...prev, quantumLeapUsed: updatedAdvantageStatesForPlayer.quantumLeapUsed }));
        } else { // Opponent was black
          setBlackPlayerAdvantageStates(prev => ({ ...prev, quantumLeapUsed: updatedAdvantageStatesForPlayer.quantumLeapUsed }));
        }
        alert(`Opponent used Quantum Leap, swapping pieces on ${from} and ${to}.`);
      }
      setIsQuantumLeapActive(false);
      setQuantumLeapSelections([]);
    };
    socket.on("quantum_leap_swap_applied", handleQuantumLeapApplied);


    return () => {
      console.log(
        `[ChessGame useEffect cleanup] Cleaning up listeners for room: ${roomId}, color: ${color}`,
      );
      socket.off("colorAssigned", handleColorAssigned);
      socket.off("opponentJoined", handleOpponentJoined);
      socket.off("opponentDisconnected", handleOpponentDisconnected);
      socket.off("gameStart", handleGameStart);
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
      socket.off("bishopSummoned", handleBishopSummoned);
      socket.off("summonBishopFailed", handleSummonBishopFailed);
      socket.off("quantum_leap_swap_applied", handleQuantumLeapApplied);
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
        setKnightmareActiveKnight(null);
        setKnightmarePossibleMoves([]);
      }
    }
  }, [fen, color, restrictedToPieceType, knightmareActiveKnight, game]); 


  const handleActivateVoidStep = () => {
    if (!socket) return;
    console.log("[Void Step UI Debug] Activating Void Step");
    setIsVoidStepToggleActive(true);  // Set the toggle state to true
    socket.emit('activate_void_step');
  };

  const currentPlayerAdvantageStates = playerColor === 'white' ? whitePlayerAdvantageStates : blackPlayerAdvantageStates;
  const canUseVoidStep = currentPlayerAdvantageStates && isVoidStepAvailable(currentPlayerAdvantageStates);

  console.log("[Void Step UI Debug] State:", {
    myAdvantage,
    playerColor,
    currentPlayerAdvantageStates,
    canUseVoidStep,
    isPlayerTurn: color && game.turn() === color[0],
    voidStepState: currentPlayerAdvantageStates?.voidStep,
    isVoidStepToggleActive
  });

  // Add debug logs in onSquareClick
  const onSquareClick = (squareClicked: Square) => {
    const pieceOnSquare = game.get(squareClicked);

    // Hidden Heir Selection Logic
    if (
      myAdvantage?.id === 'hidden_heir' &&
      !hiddenHeirSelectionInfo.square && // Heir not yet selected by this player
      !hiddenHeirSelectionInfo.captured && // Should always be false before selection, but good check
      game.history().length === 0 && // Game not started
      color && // Player color is known
      pieceOnSquare && pieceOnSquare.color === color[0] // Clicked one of their own pieces
    ) {
      if (!pieceTracking) {
        toast.error("Piece tracking not loaded yet. Please wait for the board to finish loading.");
        return;
      }
      const selectionMade = handleHeirSelectionClient(
        roomId,
        squareClicked,
        pieceOnSquare.type,
        color === "white" ? "w" : "b",
        myAdvantage,
        game, // chess.js instance
        (color === 'white' ? whitePlayerAdvantageStates : blackPlayerAdvantageStates),
        pieceTracking
      );

      if (selectionMade) {
        // UI will update via server's "advantageStateUpdated" event
        console.log(`[HiddenHeir ChessGame] Client-side heir selection on ${squareClicked}, sent to server.`);
      }
      return; // Consume the click for heir selection
    }

    // Quantum Leap Selection Logic
    if (isQuantumLeapActive && color && myAdvantage?.id === 'quantum_leap') {
      const piece = game.get(squareClicked);
      if (!piece || piece.color !== color[0]) {
        alert("Quantum Leap: Please select one of your own pieces.");
        // Clear selections on invalid click, or allow re-selection of first piece
        // setQuantumLeapSelections([]); 
        return;
      }

      if (quantumLeapSelections.includes(squareClicked)) {
        // Deselect if clicked again
        setQuantumLeapSelections(prev => prev.filter(sq => sq !== squareClicked));
        return;
      }

      const newSelections = [...quantumLeapSelections, squareClicked];
      setQuantumLeapSelections(newSelections);

      if (newSelections.length === 2) {
        if (!roomId) {
          alert("Error: Room ID not found. Cannot perform Quantum Leap.");
          setIsQuantumLeapActive(false);
          setQuantumLeapSelections([]);
          return;
        }
        // Ensure the game instance passed is the most current one if needed by handleQuantumLeapClient
        // const currentSnapshotGame = new Chess(fen); 
        const payload = getQuantumLeapPayload({ from: newSelections[0], to: newSelections[1] });
        socket.emit("quantum_leap_swap", { roomId, ...payload });
        setIsQuantumLeapActive(false);
        setQuantumLeapSelections([]);
      }
      return; // Consume click for Quantum Leap
    }

    if (isRecallActive && myAdvantage?.id === 'recall' && color && !myRecallState?.used) {
      const piece = game.get(squareClicked);
      if (!piece || piece.color !== color[0]) {
        alert("Recall Error: Please select one of your own pieces.");
        return;
      }

      let historyForClientValidation = [...fenHistory];
      if (historyForClientValidation.length > 0 && historyForClientValidation[historyForClientValidation.length - 1] === game.fen()) {
        historyForClientValidation = historyForClientValidation.slice(0, historyForClientValidation.length - 1);
      }

      if (historyForClientValidation.length < 6) {
        alert("Recall Error: Not enough game history for client validation (needs at least 6 prior states). Current relevant history length: " + historyForClientValidation.length);
        setIsRecallActive(false);
        return;
      }
      
      console.log(`[Recall UI] Calling handleRecallClient. Piece on: ${squareClicked}, Player: ${color}, History for client (len ${historyForClientValidation.length}):`, historyForClientValidation.slice(-7));
      
      const recallResult = handleRecallClient({
        game: new Chess(game.fen()),
        fenHistory: historyForClientValidation,
        pieceSquare: squareClicked,
        playerColor: color[0] as 'w' | 'b',
      });

      if (recallResult.outcome === "success") {
        console.log(`[Recall UI] Client validation success for ${squareClicked}. Emitting recall_piece.`);
        socket.emit("recall_piece", {
          roomId,
          pieceSquare: squareClicked,
        });
        // UI will update upon receiving new FEN from server via receiveMove
        alert(`Recall initiated for piece on ${squareClicked}. Waiting for server confirmation...`);
      } else {
        alert(`Recall Failed (Client Validation): ${recallResult.reason || "Unknown error"}`);
      }
      setIsRecallActive(false); // Deactivate after attempt, success or fail
      return; // Important: consume the click
    }
    console.log("[Void Step UI Debug] Square clicked:", {
      square: squareClicked,
      isVoidStepToggleActive,
      selectedSquare,
      validMoves,
      piece: game.get(squareClicked)
    });

    // Void Step handling
    if (
      myAdvantage?.id === "void_step" &&
      isVoidStepToggleActive &&
      currentPlayerAdvantageStates?.voidStep?.isActive &&
      !currentPlayerAdvantageStates.voidStep.hasUsed &&
      color &&
      game.turn() === color[0]
    ) {
      // PATCH: If you click a piece of yours (not king), always update highlights and selectedSquare
      const piece = game.get(squareClicked);
      if (piece && piece.color === color[0] && piece.type !== 'k') {
        console.log("[Void Step UI Debug] Valid piece selected for Void Step");
        const moves = getValidVoidStepMoves(game, squareClicked, color[0], currentPlayerAdvantageStates.voidStep);
        console.log("[Void Step UI Debug] Valid moves for piece:", moves);
        setSelectedSquare(squareClicked);
        setValidMoves(moves);
        return; // PATCH: Always return after highlighting, do not fall through
      }
      // If you click a highlighted valid move, make the move
      if (selectedSquare && validMoves.includes(squareClicked)) {
        console.log("[Void Step UI Debug] Attempting Void Step move:", {
          from: selectedSquare,
          to: squareClicked,
          validMoves
        });
        makeMove(selectedSquare, squareClicked);
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }
      // PATCH: If you click anywhere else, clear selection/highlights
      setSelectedSquare(null);
      setValidMoves([]);
      return;
    }

    // No-Show Bishop Summon Logic
    if (
      isSummonModeActive &&
      myAdvantage?.id === 'no_show_bishop' &&
      noShowBishopState &&
      !noShowBishopState.used &&
      color &&
      noShowBishopState.removedPiece
    ) {
      // PATCH: Log the current FEN and the entire board for debugging
      console.log("[No-Show Bishop] Summon attempt on", squareClicked, "Current FEN:", game.fen());
      for (let r = 8; r >= 1; r--) {
        let rowLog = "";
        for (let c = 0; c < 8; c++) {
          const sq = String.fromCharCode(97 + c) + r;
          const piece = game.get(sq as Square);
          rowLog += (piece ? piece.type + piece.color : "--") + " ";
        }
        console.log(`[No-Show Bishop] Board row ${r}:`, rowLog);
      }
      const pieceOnSquare = game.get(squareClicked);
      console.log(
        "[No-Show Bishop] Summon attempt on",
        squareClicked,
        "pieceOnSquare:",
        pieceOnSquare,
        "Typeof:",
        typeof pieceOnSquare
      );
      // PATCH: Use the same empty square check as Sacrificial Blessing
      if (pieceOnSquare === null || typeof pieceOnSquare === 'undefined') {
        const payload: SummonNoShowBishopPayload = {
          square: squareClicked,
          color: color, // 'white' or 'black'
          piece: {
            type: noShowBishopState.removedPiece.type, // e.g., 'b'
            color: color[0] as 'w' | 'b', // 'w' or 'b'
          },
        };
        console.log("[No-Show Bishop] Emitting summon_no_show_bishop with payload:", payload);
        socket.emit("summon_no_show_bishop", { roomId, payload });
        setIsSummonModeActive(false);
      } else {
        alert("Cannot summon bishop to an occupied square. Click an empty square or cancel summon.");
        console.log("[No-Show Bishop] Attempted to summon on occupied square:", squareClicked, "Piece:", pieceOnSquare);
      }
      return;
    }

    // Coordinated Push Click-Click Logic
    if (awaitingSecondPush && firstPushDetails && color) {
        console.log("[CP DEBUG] Awaiting second push. Clicked:", squareClicked, "FirstPushDetails:", firstPushDetails, "EligibleSecondPawns:", eligibleSecondPawns, "SecondPawnSelected:", secondPawnSelected);

        const pieceOnSquare = game.get(squareClicked);

        if (secondPawnSelected) { // Second click: target square for the selected second pawn
            const tempSecondMove: Partial<Move> = {
                from: secondPawnSelected,
                to: squareClicked,
                piece: 'p', 
                color: firstPushDetails.color,
            };

            // Basic validation for the second move (must be one square forward, same file)
            const fromRank = parseInt(secondPawnSelected[1]);
            const toRank = parseInt(squareClicked[1]);
            const expectedToRank = fromRank + (firstPushDetails.color === 'w' ? 1 : -1);

            console.log("[CP DEBUG] Second pawn selected. From:", secondPawnSelected, "To:", squareClicked, "ExpectedToRank:", expectedToRank);

            if (squareClicked[0] === secondPawnSelected[0] && toRank === expectedToRank && !game.get(squareClicked)) {
                const finalSecondMove = { 
                    ...tempSecondMove, 
                    flags: 'n', 
                    san: '', 
                    lan: '',
                    before: '', 
                    after: '' 
                } as Move; 

                const valid = validateCoordinatedPushClientMove(firstPushDetails, finalSecondMove);
                console.log("[CP DEBUG] Validating second move:", finalSecondMove, "Result:", valid);

                if (valid) {
                    console.log("[CP DEBUG] Emitting coordinated_push move to server:", {
                        from: firstPushDetails.from,
                        to: firstPushDetails.to,
                        secondFrom: finalSecondMove.from,
                        secondTo: finalSecondMove.to,
                        special: 'coordinated_push',
                        color: color,
                    });
                    socket.emit("sendMove", {
                        roomId,
                        move: {
                            from: firstPushDetails.from,
                            to: firstPushDetails.to,
                            secondFrom: finalSecondMove.from,
                            secondTo: finalSecondMove.to,
                            special: 'coordinated_push',
                            color: color,
                        },
                    });
                    if (coordinatedPushState) {
                        setCoordinatedPushState({ ...coordinatedPushState, usedThisTurn: true });
                    }
                    setIsCoordinatedPushActive(false); 
                    setAwaitingSecondPush(false);
                    setFirstPushDetails(null);
                    setEligibleSecondPawns([]);
                    setSecondPawnSelected(null);
                } else {
                    console.warn("[CP DEBUG] Client validation for Coordinated Push (second move) failed.");
                    game.load(fenSnapshotBeforeMove.current); // Revert first local move
                    setFen(fenSnapshotBeforeMove.current);
                    setIsCoordinatedPushActive(false); // Reset toggle
                    setAwaitingSecondPush(false);
                    setFirstPushDetails(null);
                    setEligibleSecondPawns([]);
                }
            } else {
                console.warn("[CP DEBUG] Invalid target square for the second pawn. Must be one square forward and empty. Cancelling Coordinated Push.");
                if (fenSnapshotBeforeMove.current) {
                    game.load(fenSnapshotBeforeMove.current); // Revert first local move
                    setFen(fenSnapshotBeforeMove.current);
                }
                setIsCoordinatedPushActive(false); // Reset toggle
                setAwaitingSecondPush(false);
                setFirstPushDetails(null);
                setEligibleSecondPawns([]);
            }
            setSecondPawnSelected(null); 
            return; 

        } else if (eligibleSecondPawns.includes(squareClicked as Square)) { 
            if (pieceOnSquare && pieceOnSquare.type === 'p' && pieceOnSquare.color === color[0]) {
                console.log("[CP DEBUG] Selecting second pawn for Coordinated Push:", squareClicked);
                setSecondPawnSelected(squareClicked as Square);
            }
            return; 
        } else { 
            if (secondPawnSelected) setSecondPawnSelected(null);
        }
    }
    
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
      const pieceOnClickedSquare = game.get(squareClicked);

      if (!knightmareActiveKnight) { 
          if (pieceOnClickedSquare && pieceOnClickedSquare.type === 'n' && pieceOnClickedSquare.color === color[0]) {
              if (canKnightUseKnightmare(knightmareState)) {
                  const possibleMoves = getKnightmareSquares(game, squareClicked as Square, color[0] as 'w' | 'b', knightmareState);
                  setKnightmareActiveKnight(squareClicked);
                  setKnightmarePossibleMoves(possibleMoves);
              } else {
                  setKnightmareActiveKnight(null);
                  setKnightmarePossibleMoves([]);
              }
          } else {
               setKnightmareActiveKnight(null);
               setKnightmarePossibleMoves([]);
          }
      } else { 
          if (knightmarePossibleMoves.includes(squareClicked as Square)) {
              makeMove(knightmareActiveKnight, squareClicked, true); 
          } else { 
              const previouslySelectedKnight = knightmareActiveKnight; 
              setKnightmareActiveKnight(null);
              setKnightmarePossibleMoves([]);
              if (squareClicked !== previouslySelectedKnight && pieceOnClickedSquare && pieceOnClickedSquare.type === 'n' && pieceOnClickedSquare.color === color[0]) {
                   if (canKnightUseKnightmare(knightmareState)) {
                      const possibleMoves = getKnightmareSquares(game, squareClicked as Square, color[0] as 'w' | 'b', knightmareState);
                      setKnightmareActiveKnight(squareClicked);
                      setKnightmarePossibleMoves(possibleMoves);
                  }
              }
          }
      }
      return; 
    }

    if (selectedSquare) {
      const move = makeMove(selectedSquare, squareClicked);
      if (move) {
        setSelectedSquare(null);
        setValidMoves([]);
      }
    } else {
      const piece = game.get(squareClicked);
      if (piece && piece.color === color?.[0]) {
        setSelectedSquare(squareClicked);
        setValidMoves(game.moves({ square: squareClicked, verbose: true }).map(move => move.to as Square));
      }
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
    if (isQuantumLeapActive) { // Block standard moves if QL is active
      alert("Quantum Leap is active. Select two of your pieces to swap or cancel.");
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
          socket.emit("gameOver", { roomId, message: `${winner} wins by checkmate!`, winnerColor: winner });
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
    
    // Coordinated Push Logic (primarily for drag-and-drop, or if onSquareClick calls makeMove)
    if (myColor && !isKnightmareMove) { // Ensure not a knightmare move and color is set
        // Handling the FIRST part of Coordinated Push
        if (isCoordinatedPushActive && !awaitingSecondPush && !coordinatedPushState?.usedThisTurn && color) {
            const piece = game.get(from as Square);
            console.log("[CP DEBUG] Attempting first pawn push. From:", from, "To:", to, "Piece:", piece);

            if (piece?.type === 'p' && piece.color === color[0]) {
                const tempGame = new Chess(game.fen());
                const potentialFirstMove = tempGame.move({ from: from as Square, to: to as Square, promotion: 'q' });

                console.log("[CP DEBUG] First pawn push move result:", potentialFirstMove);

                if (potentialFirstMove && potentialFirstMove.piece === 'p' && 
                    !potentialFirstMove.captured && 
                    (potentialFirstMove.flags.includes('n') || potentialFirstMove.flags.includes('np')) &&
                    Math.abs(parseInt(potentialFirstMove.to[1]) - parseInt(potentialFirstMove.from[1])) === 1 &&
                    potentialFirstMove.from[0] === potentialFirstMove.to[0]
                ) {
                    const gameForEligibleCheck = new Chess(game.fen());
                    const eligiblePawns = isEligibleCoordinatedPushPair(gameForEligibleCheck, potentialFirstMove);

                    console.log("[CP DEBUG] Eligible second pawns after first push:", eligiblePawns);

                    if (eligiblePawns.length > 0) {
                        fenSnapshotBeforeMove.current = game.fen(); // Save current FEN

                        setFirstPushDetails(potentialFirstMove);
                        setEligibleSecondPawns(eligiblePawns);
                        setAwaitingSecondPush(true);
                        console.log("[CP DEBUG] First push applied locally. Awaiting second push. State updated.");
                        return null; // Prevent standard move processing
                    } else {
                        console.log("[CP DEBUG] Valid pawn push, but no eligible second pawn. Will fall through to standard move logic.");
                    }
                }
            }
        }

        // Handling the SECOND part of Coordinated Push (if drag-and-drop is used for the second pawn)
        if (awaitingSecondPush && firstPushDetails && color && from && to) {
            console.log("[CP DEBUG] Drag-drop for second pawn. From:", from, "To:", to, "EligibleSecondPawns:", eligibleSecondPawns);

            if (eligibleSecondPawns.includes(from as Square)) {
                const piece = game.get(from as Square);
                if (piece?.type === 'p' && piece.color === color[0]) {
                    const tempGameForSecondMoveValidation = new Chess(game.fen());
                    const potentialSecondMove = tempGameForSecondMoveValidation.move({from: from as Square, to: to as Square, promotion: 'q'});

                    console.log("[CP DEBUG] Second pawn move result:", potentialSecondMove);

                    if (potentialSecondMove && potentialSecondMove.piece === 'p' && 
                        !potentialSecondMove.captured &&
                        Math.abs(parseInt(potentialSecondMove.to[1]) - parseInt(potentialSecondMove.from[1])) === 1 &&
                        potentialSecondMove.from[0] === potentialSecondMove.to[0]
                    ) {
                        const valid = validateCoordinatedPushClientMove(firstPushDetails, potentialSecondMove);
                        console.log("[CP DEBUG] Validating second move (drag-drop):", potentialSecondMove, "Result:", valid);

                        if (valid) {
                            console.log("[CP DEBUG] Emitting coordinated_push move to server (drag-drop):", {
                                from: firstPushDetails.from,
                                to: firstPushDetails.to,
                                secondFrom: potentialSecondMove.from,
                                secondTo: potentialSecondMove.to,
                                special: 'coordinated_push',
                                color: color,
                            });
                            socket.emit("sendMove", {
                                roomId,
                                move: {
                                    from: firstPushDetails.from,
                                    to: firstPushDetails.to,
                                    secondFrom: potentialSecondMove.from,
                                    secondTo: potentialSecondMove.to,
                                    special: 'coordinated_push',
                                    color: color,
                                },
                            });
                            if (coordinatedPushState) {
                               setCoordinatedPushState({ ...coordinatedPushState, usedThisTurn: true });
                            }
                            setIsCoordinatedPushActive(false); 
                            setAwaitingSecondPush(false);
                            setFirstPushDetails(null);
                            setEligibleSecondPawns([]);
                            setSecondPawnSelected(null);
                        } else {
                            console.warn("[CP DEBUG] Client validation for Coordinated Push (second move) failed.");
                            game.load(fenSnapshotBeforeMove.current); // Revert first local move
                            setFen(fenSnapshotBeforeMove.current);
                            setIsCoordinatedPushActive(false); // Reset toggle
                            setAwaitingSecondPush(false);
                            setFirstPushDetails(null);
                            setEligibleSecondPawns([]);
                        }
                    } else {
                        console.warn("[CP DEBUG] Second move for Coordinated Push is not a valid one-square pawn push. Cancelling Coordinated Push.");
                        game.load(fenSnapshotBeforeMove.current); // Revert first local move
                        setFen(fenSnapshotBeforeMove.current);
                        setIsCoordinatedPushActive(false); // Reset toggle
                        setAwaitingSecondPush(false);
                        setFirstPushDetails(null);
                        setEligibleSecondPawns([]);
                    }
                }
            } else {
                // Dragged piece is not an eligible second pawn. Cancel Coordinated Push attempt.
                console.warn("[CP DEBUG] The piece you tried to move is not an eligible second pawn for Coordinated Push. Cancelling.");
                game.load(fenSnapshotBeforeMove.current); // Revert first local move
                setFen(fenSnapshotBeforeMove.current);
                setIsCoordinatedPushActive(false); // Also turn off the toggle
                setAwaitingSecondPush(false);
                setFirstPushDetails(null);
                setEligibleSecondPawns([]);
                setSecondPawnSelected(null); // Ensure reset
            }
            return null; // Prevent standard move processing if we were awaiting second push
        }
    }

    if (
      myAdvantage?.id === "void_step" &&
      currentPlayerAdvantageStates?.voidStep?.isActive &&
      !currentPlayerAdvantageStates?.voidStep?.hasUsed &&
      color
    ) {
      console.log("[ChessGame makeMove] Attempting Void Step move from", from, "to", to);
      const piece = game.get(from as Square);
      if (piece && piece.color === color[0] && piece.type !== 'k') {
        if (canPieceUseVoidStep(game, from as Square, to as Square, color[0] as 'w' | 'b', currentPlayerAdvantageStates.voidStep)) {
          const movePayload = {
            from,
            to,
            special: 'void_step',
            color: color
          };
          console.log("[ChessGame makeMove] Emitting Void Step move:", movePayload);
          socket.emit("sendMove", { roomId, move: movePayload });
          return null;
        } else {
          alert("Invalid Void Step move. The move must be legal without considering blocking pieces.");
          return null;
        }
      }
    }

      if (!move && isKnightmareMove && myAdvantage?.id === 'knightmare' && knightmareState && color) {
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
        const knightmarePayload = handleKnightmareClientMove({
          game, 
          from,
          to,
          color: color, 
          knightmareState, 
        });

        if (knightmarePayload) {
          fenSnapshotBeforeMove.current = game.fen(); 
          setKnightmareState({ hasUsed: true });
          socket.emit("sendMove", { roomId, move: knightmarePayload });
          setKnightmareActiveKnight(null);
          setKnightmarePossibleMoves([]);
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
            promotion: standardMoveAttempt.promotion,
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

  const handleBoardRevert = ({ fen }: { fen: string }) => {
    game.load(fen);
    setFen(fen);
    setGameOverMessage(null); // Hide game over UI if showing
  };
socket.on("boardRevert", handleBoardRevert);

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
  

  const customSquareStyles = useMemo(() => {
    const styles: { [key: string]: React.CSSProperties } = {};
    
    // Highlight selected square
    if (selectedSquare) {
      styles[selectedSquare] = {
        background: "rgba(255, 255, 0, 0.4)",
        cursor: "pointer"
      };
    }

    // Highlight valid moves
    validMoves.forEach(square => {
      styles[square] = {
        background: "rgba(220, 180, 255, 0.4)",
        cursor: "pointer"
      };
    });

    // Void Step Highlighting
    if (myAdvantage?.id === "void_step" && isVoidStepToggleActive && currentPlayerAdvantageStates?.voidStep?.isActive && !currentPlayerAdvantageStates.voidStep.hasUsed && color && game.turn() === color[0]) {
      console.log("[Void Step UI Debug] Applying Void Step highlighting", {
        selectedSquare,
        validMoves
      });
      
      if (selectedSquare) {
        console.log("[Void Step UI Debug] Highlighting selected square:", selectedSquare);
        styles[selectedSquare] = { 
          ...styles[selectedSquare], 
          background: "rgba(255, 255, 0, 0.4)",
          cursor: "pointer"
        };
        
        validMoves.forEach(sq => {
          console.log("[Void Step UI Debug] Highlighting valid move:", sq);
          styles[sq] = { 
            ...styles[sq], 
         background: "rgba(220, 180, 255, 0.4)",
            cursor: "pointer"
          };
        });
      }
    }

    if (isSacrificialBlessingActive) {
      availablePiecesForBlessing.forEach(p => {
        styles[p.square] = { ...styles[p.square], background: "rgba(173, 216, 230, 0.7)", cursor: 'pointer' };
      });
      if (selectedPieceForBlessing) {
        // Highlight all empty squares as possible targets for placement
        const blessingFenForStyling = useSacrificialBlessingStore.getState().currentBlessingFen;
        if (!blessingFenForStyling) {
          console.error('[SB Debug customSquareStyles] No blessingFenForStyling available from store.');
          return styles; 
        }
        const stylingGame = new Chess();
        try {
          stylingGame.load(blessingFenForStyling);
          console.log('[SB Debug customSquareStyles] stylingGame loaded with store FEN. Current FEN:', stylingGame.fen());
        } catch (e) {
          console.error("[SB Debug customSquareStyles] Error loading FEN from store into stylingGame:", e);
          return styles; 
        }
        // Highlight all empty squares
        for (let file = 0; file < 8; file++) {
          for (let rank = 1; rank <= 8; rank++) {
            const sq = String.fromCharCode(97 + file) + rank as Square;
            if (!stylingGame.get(sq)) {
              styles[sq] = { ...styles[sq], background: "rgba(255,255,150,0.4)", cursor: "pointer" };
            }
          }
        }
        // Optionally, highlight the selected piece
        styles[selectedPieceForBlessing.square] = { ...styles[selectedPieceForBlessing.square], background: "rgba(0,128,255,0.5)" };
      }
    }

    // Quantum Leap Highlighting
    if (isQuantumLeapActive) {
      quantumLeapSelections.forEach(sq => {
        styles[sq] = { ...styles[sq], background: "rgba(70, 130, 180, 0.6)" }; // Steel blue highlight
      });
      if (quantumLeapSelections.length === 1) { // If one piece is selected, highlight it more prominently
        styles[quantumLeapSelections[0]] = { ...styles[quantumLeapSelections[0]], background: "rgba(70, 130, 180, 0.9)" };
      }
    }

    return styles;
  }, [selectedSquare, validMoves, isVoidStepToggleActive, currentPlayerAdvantageStates, color, game.turn(), isQuantumLeapActive, quantumLeapSelections, isSacrificialBlessingActive, availablePiecesForBlessing, selectedPieceForBlessing, myAdvantage, hiddenHeirSelectionInfo]);

  // Add handler for advantage state update
  const handleAdvantageStateUpdate = (data: any) => {
    console.log("[ChessGame] Received advantageStateUpdated for Void Step:", data);
    if (data.advantageId === 'void_step') {
      if (playerColor === 'white') {
        setWhitePlayerAdvantageStates(prev => ({
          ...prev,
          voidStep: data.state
        }));
      } else {
        setBlackPlayerAdvantageStates(prev => ({
          ...prev,
          voidStep: data.state
        }));
      }
      // If the advantage is deactivated, also update the toggle state
      if (!data.state.isActive) {
        setIsVoidStepToggleActive(false);
      }
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
            {/* Hidden Heir UI Prompts */}
            {myAdvantage?.id === 'hidden_heir' && !hiddenHeirSelectionInfo.square && game.history().length === 0 && (
              <div style={{ padding: '10px', margin: '10px 0', background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '4px' }}>
                <p><strong>Hidden Heir:</strong> Select one of your pieces (excluding the king) to be your Hidden Heir. This piece must be captured before your opponent can checkmate you.</p>
              </div>
            )}
            {myAdvantage?.id === 'hidden_heir' && hiddenHeirSelectionInfo.square && !hiddenHeirSelectionInfo.captured && (
              <div style={{ padding: '10px', margin: '10px 0', background: '#dcedc8', border: '1px solid #a5d6a7', borderRadius: '4px' }}>
                <p><strong>Hidden Heir:</strong> Your heir is on {hiddenHeirSelectionInfo.square}. Piece ID: {hiddenHeirSelectionInfo.pieceId || 'N/A'}.</p>
              </div>
            )}
            {myAdvantage?.id === 'hidden_heir' && hiddenHeirSelectionInfo.captured && (
              <div style={{ padding: '10px', margin: '10px 0', background: '#ffcdd2', border: '1px solid #ef9a9a', borderRadius: '4px' }}>
                <p><strong>Hidden Heir:</strong> Your heir on {hiddenHeirSelectionInfo.square} (Piece ID: {hiddenHeirSelectionInfo.pieceId || 'N/A'}) has been captured!</p>
              </div>
            )}
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
            <p style={{ marginTop: '10px', fontStyle: 'italic' }}><em>Royal Decree has been used.</em></p>
          )}
          {myAdvantage?.id === "queens_domain" && color && game.turn() === color[0] && !queensDomainState?.hasUsed && isQueenAlive(game, color) && (
            <button
              onClick={() => {
                const newToggleState = !isQueensDomainToggleActive; 
                setIsQueensDomainToggleActive(newToggleState); 

                if (newToggleState) {
                  alert("Queen's Domain activated: Your next queen move can pass through friendly pieces.");
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
              👑 {isQueensDomainToggleActive ? "Deactivate" : "Use"} Queen's Domain
            </button>
          )}
          {myAdvantage?.id === "queens_domain" && queensDomainState?.hasUsed && (
            <p style={{color: "red", margin: "5px"}}><em>Queen's Domain has been used.</em></p>
          )}

          {/* Coordinated Push Button and Info */}
          {myAdvantage?.id === "coordinated_push" && !coordinatedPushState?.usedThisTurn && (
            <button
              onClick={() => {
                if (awaitingSecondPush) { // If active and awaiting, cancel it
                  setAwaitingSecondPush(false);
                  setFirstPushDetails(null);
                  setEligibleSecondPawns([]);
                  setSecondPawnSelected(null);
                  // Revert local board if first move was shown
                  if (fenSnapshotBeforeMove.current) {
                    game.load(fenSnapshotBeforeMove.current); 
                    setFen(game.fen());
                  }
                }
                const newToggleState = !isCoordinatedPushActive; 
                setIsCoordinatedPushActive(newToggleState);
              }}
              disabled={coordinatedPushState?.usedThisTurn}
              style={{ background: isCoordinatedPushActive ? "lightblue" : "", marginTop: "5px" }}
              title="Push two adjacent pawns forward in the same turn."
            >
              {isCoordinatedPushActive ? "Deactivate" : "Activate"} Coordinated Push
            </button>
          )}
          {myAdvantage?.id === "coordinated_push" && coordinatedPushState?.usedThisTurn && (
            <p style={{ marginTop: '5px' }}><em>Coordinated Push has been used this turn.</em></p>
          )}
          {awaitingSecondPush && (
            <div style={{ marginTop: '5px', padding: '5px', background: '#lightyellow', border: '1px solid #ccc' }}>
              <p>Coordinated Push: First pawn moved. Select an eligible second pawn (highlighted) then its target square.</p>
              <p>Eligible second pawns: {eligibleSecondPawns.join(', ')}</p>
            </div>
          )}

          {/* No-Show Bishop Summon Button and UI */}
          {myAdvantage?.id === 'no_show_bishop' && noShowBishopState && !noShowBishopState.used && game && color && game.turn() === color[0] && isSummonAvailable(game.history().length, noShowBishopState.used) && noShowBishopState.removedPiece && (
            <div style={{ marginTop: '10px', padding: '10px', background: '#f0e6ff', borderRadius: '4px' }}>
              {!isSummonModeActive ? (
                <button
                  onClick={() => {
                    setIsSummonModeActive(true);
                    alert("Summon Mode Activated: Click an empty square on the board to summon your bishop.");
                    console.log("[No-Show Bishop] Summon mode activated.");
                  }}
                >
                  Summon Bishop ({noShowBishopState.removedPiece.type.toUpperCase()} from {noShowBishopState.removedPiece.square})
                </button>
              ) : (
                <div>
                  <p><strong>Summon Mode Active:</strong> Click an empty square to place your bishop.</p>
                  <button
                    onClick={() => {
                      setIsSummonModeActive(false);
                      console.log("[No-Show Bishop] Summon mode cancelled.");
                    }}
                  >
                    Cancel Summon
                  </button>
                </div>
              )}
            </div>
          )}
          {myAdvantage?.id === 'no_show_bishop' && noShowBishopState?.used && (
            <p style={{ marginTop: '5px', fontStyle: 'italic' }}>Your No-Show Bishop has been summoned.</p>
          )}
           {myAdvantage?.id === 'no_show_bishop' && noShowBishopState && !noShowBishopState.used && game && !isSummonAvailable(game.history().length, noShowBishopState.used) && (
            <p style={{ marginTop: '5px', fontStyle: 'italic', color: 'grey' }}>The period to summon your No-Show Bishop has expired.</p>
          )}
          {myAdvantage?.id === 'void_step' && canUseVoidStep && (
            <button
              className={`advantage-button ${currentPlayerAdvantageStates?.voidStep?.isActive ? 'active' : ''}`}
              onClick={handleActivateVoidStep}
            >
              Activate Void Step
            </button>
          )}
          {/* Recall Button */}
          {myAdvantage?.id === 'recall' && color && game.turn() === color[0] && !myRecallState?.used && (
            <button
              onClick={() => {
                if (isRecallActive) {
                  setIsRecallActive(false);
                  alert("Recall action cancelled.");
                } else {
                  let historyForCheck = [...fenHistory];
                  if (historyForCheck.length > 0 && historyForCheck[historyForCheck.length -1] === game.fen()){
                      historyForCheck = historyForCheck.slice(0, -1); 
                  }
                  if (historyForCheck.length < 6) {
                    alert("Recall Error: Not enough game history recorded on client (less than 3 full turns of previous states). Current history length for check: " + historyForCheck.length);
                    return;
                  }
                  setIsRecallActive(true);
                  alert("Recall Activated: Click one of your pieces to teleport it to its position 3 turns ago.");
                }
              }}
              style={{ backgroundColor: isRecallActive ? 'lightblue' : undefined, margin: '5px', padding: '8px 12px' }}
            >
              {isRecallActive ? 'Cancel Recall Action' : `Use Recall (${myAdvantage.rarity})`}
            </button>
          )}
          {myAdvantage?.id === 'recall' && myRecallState?.used && (
            <p style={{ margin: '5px', fontStyle: 'italic' }}>Recall has been used.</p>
          )}

          {/* Quantum Leap Button */}
          {myAdvantage?.id === 'quantum_leap' && color && game.turn() === color[0] &&
           !((color === 'white' ? whitePlayerAdvantageStates?.quantumLeapUsed : blackPlayerAdvantageStates?.quantumLeapUsed)) && (
            <button
              onClick={() => {
                if (isQuantumLeapActive) {
                  setIsQuantumLeapActive(false);
                  setQuantumLeapSelections([]);
                } else {
                  const currentQLUsed = color === 'white' ? whitePlayerAdvantageStates?.quantumLeapUsed : blackPlayerAdvantageStates?.quantumLeapUsed;
                  if (currentQLUsed) {
                    alert("Quantum Leap has already been used.");
                    return;
                  }
                  setIsQuantumLeapActive(true);
                  alert("Quantum Leap activated: Select two of your pieces to swap.");
                }
              }}
              style={{ backgroundColor: isQuantumLeapActive ? 'lightblue' : undefined, margin: '5px', padding: '8px 12px' }}
            >
              {isQuantumLeapActive ? 'Cancel Quantum Leap' : 'Use Quantum Leap'}
            </button>
          )}
          {myAdvantage?.id === 'quantum_leap' &&
           ((color === 'white' ? whitePlayerAdvantageStates?.quantumLeapUsed : blackPlayerAdvantageStates?.quantumLeapUsed)) && (
            <p style={{ margin: '5px', fontStyle: 'italic' }}>Quantum Leap has been used.</p>
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

      {myCloakDetails && (
        <div style={{ padding: '5px', margin: '5px 0', background: '#d0e0f0', border: '1px solid #a0c0d0', borderRadius: '3px' }}>
          <p>Your Cloak: Piece ID <strong>{myCloakDetails.pieceId}</strong>, Turns Remaining: <strong>{myCloakDetails.turnsRemaining}</strong></p>
        </div>
      )}

      <div style={{ position: "relative" }}>
        <Chessboard
          position={getMaskedFenForOpponent(fen, opponentAdvantageStates, color)}
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
            if (myAdvantage?.id === 'knightmare' && knightmareActiveKnight && color && game.turn() === color[0]) {
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
            } else if (arcaneReinforcementSpawnedSquare && myAdvantage?.id === 'arcane_reinforcement') {
              styles[arcaneReinforcementSpawnedSquare] = {
                ...styles[arcaneReinforcementSpawnedSquare], 
                background: "rgba(100, 200, 100, 0.4)", 
              };
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
                // Highlight all empty squares as possible targets for placement
                const blessingFenForStyling = useSacrificialBlessingStore.getState().currentBlessingFen;
                if (!blessingFenForStyling) {
                  console.error('[SB Debug customSquareStyles] No blessingFenForStyling available from store.');
                  return styles; 
                }
                const stylingGame = new Chess();
                try {
                  stylingGame.load(blessingFenForStyling);
                  console.log('[SB Debug customSquareStyles] stylingGame loaded with store FEN. Current FEN:', stylingGame.fen());
                } catch (e) {
                  console.error("[SB Debug customSquareStyles] Error loading FEN from store into stylingGame:", e);
                  return styles; 
                }
                // Highlight all empty squares
                for (let file = 0; file < 8; file++) {
                  for (let rank = 1; rank <= 8; rank++) {
                    const sq = String.fromCharCode(97 + file) + rank as Square;
                    if (!stylingGame.get(sq)) {
                      styles[sq] = { ...styles[sq], background: "rgba(255,255,150,0.4)", cursor: "pointer" };
                    }
                  }
                }
                // Optionally, highlight the selected piece
                styles[selectedPieceForBlessing.square] = { ...styles[selectedPieceForBlessing.square], background: "rgba(0,128,255,0.5)" };
              }
            }

            // Coordinated Push Highlighting
            if (awaitingSecondPush && eligibleSecondPawns.length > 0 && color) {
              const playerTurnColor = color[0]; // 'w' or 'b'
              eligibleSecondPawns.forEach(sq => {
                  styles[sq] = { ...styles[sq], background: "rgba(255, 215, 0, 0.5)", cursor: "pointer" }; // Gold highlight for pawn itself
                  // Highlight its target square
                  const piece = game.get(sq); // game has first move applied, so this piece is in its original spot for the second move
                  if (piece && piece.color === playerTurnColor) { // Ensure it's the current player's pawn
                      const targetRank = parseInt(sq[1]) + (piece.color === 'w' ? 1 : -1);
                      const targetSq = `${sq[0]}${targetRank}`;
                      // Check if target is valid (on board) and empty (on the game state *after* the first push)
                      if (targetRank >=1 && targetRank <=8 && !game.get(targetSq as Square)) { 
                           styles[targetSq] = { ...styles[targetSq], background: "rgba(255, 255, 150, 0.4)", cursor: "pointer" }; // Lighter yellow for target
                      }
                  }
              });
            }
            if (secondPawnSelected) { // Highlight selected second pawn for click-click
                styles[secondPawnSelected] = { ...styles[secondPawnSelected], background: "rgba(0, 128, 0, 0.7)" }; // Green when selected
            }

            // Void Step Highlighting
            if (myAdvantage?.id === "void_step" && isVoidStepToggleActive && currentPlayerAdvantageStates?.voidStep?.isActive && !currentPlayerAdvantageStates.voidStep.hasUsed && color && game.turn() === color[0]) {
              if (selectedSquare) {
                styles[selectedSquare] = { ...styles[selectedSquare], background: "rgba(255, 255, 0, 0.4)" };
                validMoves.forEach(sq => {
                  styles[sq] = { ...styles[sq], background: "rgba(220, 180, 255, 0.4)" };
                });
              }
            }

            // Hidden Heir Highlighting (current player's active heir)
            if (myAdvantage?.id === 'hidden_heir' && hiddenHeirSelectionInfo.square && !hiddenHeirSelectionInfo.captured) {
              styles[hiddenHeirSelectionInfo.square] = {
                ...styles[hiddenHeirSelectionInfo.square], // Preserve other styles if any
                background: "rgba(76, 175, 80, 0.3)", // A green highlight
                boxShadow: "inset 0 0 5px rgba(76, 175, 80, 0.7)",
              };
            }

            return styles;
          })()}
          customPieces={React.useMemo(() => {
  const pieces: { [square: string]: React.ReactNode } = {};
  if (!game || !color || !opponentAdvantageStates?.cloak) return pieces;

  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const squareInfo = board[r][c];
      if (squareInfo) {
        const square = String.fromCharCode(97 + c) + (8 - r); // e.g., "e4"
        const pieceDetails = { type: squareInfo.type, color: squareInfo.color };
        if (shouldHidePiece(square, pieceDetails, opponentAdvantageStates, color)) {
          pieces[square] = null;
        }
      }
    }
  }
  return pieces;
}, [fen, game, opponentAdvantageStates, color])} // Ensure `fen` is a dependency if `game.board()` depends on it implicitly via `game` object updates.
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