import React from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import MeetingAgent from './components/MeetingAgent';
import DirectorReviewView from './components/DirectorReviewView';

function ReviewWrapper() {
  const { reviewId } = useParams();
  return <DirectorReviewView reviewId={reviewId} />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MeetingAgent />} />
        <Route path="/review/:reviewId" element={<ReviewWrapper />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
