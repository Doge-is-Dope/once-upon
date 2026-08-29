import { lastTavernStory } from '../experiences/the-last-manuscript/story';
import { fixtureExperience } from './fixtures';
import { describeStoryContract } from './story-contract';

describeStoryContract(lastTavernStory);
describeStoryContract(fixtureExperience().story);
