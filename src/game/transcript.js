export const createTranscript = () => {
  const events = [];

  return {
    add(event) {
      events.push({
        seq: events.length + 1,
        ...event
      });
    },

    list() {
      return events.slice();
    },

    latestSeq() {
      return events.length;
    }
  };
};
